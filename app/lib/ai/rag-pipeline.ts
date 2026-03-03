import { GoogleGenerativeAI } from '@google/generative-ai'
import { createAdminClient } from '@/lib/supabase/server'
import { sendWhatsAppMessage } from '@/lib/wasender/client'
import { extractLeadProfile } from '@/lib/ai/lead-profiler'
import { sendTelegramAlert, buildLeadChaudAlert } from '@/lib/notifications/telegram'
import { BLOLAB_SYSTEM_PROMPT } from '@/lib/ai/prompts'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!)

/** Embedding via fetch REST Gemini v1beta — évite le bug SDK qui force v1beta pour embedContent */
async function getEmbedding(text: string): Promise<number[]> {
    const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY!
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${key}`
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: { parts: [{ text }] } }),
    })
    const json = await res.json() as any
    if (!res.ok) throw new Error(`Gemini embedding error: ${JSON.stringify(json)}`)
    return json.embedding.values
}

export interface RAGInput {
    from: string           // Numéro WhatsApp (= chat_id dans Profil_Prospects)
    text: string
    conversationId: string
}

export async function triggerAIResponse(input: RAGInput): Promise<void> {
    const { from, text, conversationId } = input
    const startTime = Date.now()
    const supabase = createAdminClient()

    // ─── [1] EMBEDDING DU MESSAGE ────────────────────────────────────
    const queryEmbedding = await getEmbedding(text)

    // ─── [2] RECHERCHE VECTORIELLE (table: documents) ────────────────
    const similarityThreshold = 0.60

    let chunks: any = []
    try {
        const { data } = await supabase.rpc('match_documents', {
            query_embedding: queryEmbedding,
            match_threshold: similarityThreshold,
            match_count: 5,
        })
        chunks = data
    } catch (dbErr) {
        await sendWhatsAppMessage(from, "[DEBUG] Erreur DB Match Documents: " + String(dbErr).substring(0, 200))
        throw dbErr
    }

    // ─── [3] HISTORIQUE DE CONVERSATION ─────────────────────────────
    const { data: history } = await supabase
        .from('messages')
        .select('direction, body, timestamp')
        .eq('conversation_id', conversationId)
        .eq('message_type', 'text')
        .order('timestamp', { ascending: false })
        .limit(10)

    const historyFormatted = (history ?? [])
        .reverse()
        .map((m) => ({
            role: m.direction === 'inbound' ? 'user' : 'model',
            parts: [{ text: m.body ?? '' }],
        }))

    // ─── [4] RÉCUPÉRATION PROFIL PROSPECT ───────────────────────────
    const { data: contact } = await supabase
        .from('Profil_Prospects')
        .select('prenom, profil_type, interet_principal, etape_parcours, score_engagement, programme_recommande, objectif, nombre_interactions')
        .eq('chat_id', from)
        .single()

    // ─── [5] CONSTRUCTION DU PROMPT ─────────────────────────────────
    const ragContext = (chunks as any[])
        .map((c) => `### Source: ${c.metadata?.section ?? 'BloLab'}\n${c.content}`)
        .join('\n\n')

    const contactContext = contact?.prenom
        ? `\n## Profil du contact\nPrénom: ${contact.prenom}` +
        (contact.profil_type ? ` | Type: ${contact.profil_type}` : '') +
        (contact.interet_principal ? ` | Intérêt: ${contact.interet_principal}` : '') +
        (contact.etape_parcours ? ` | Étape: ${contact.etape_parcours}` : '') +
        (contact.programme_recommande ? ` | Programme: ${contact.programme_recommande}` : '')
        : ''

    const fullSystemPrompt =
        BLOLAB_SYSTEM_PROMPT +
        contactContext +
        `\n\n## Informations BloLab pertinentes\n${ragContext}`

    // ─── [6] APPEL LLM ──────────────────────────────────────────────
    let aiResponse = ''
    let modelUsed = 'gemini-2.5-flash'

    try {
        const chatModel = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            systemInstruction: fullSystemPrompt,
        })
        const chat = chatModel.startChat({ history: historyFormatted })
        const result = await chat.sendMessage(text)
        aiResponse = result.response.text()
    } catch (geminiError) {
        console.error("Gemini failed, trying OpenAI:", geminiError)
        try {
            aiResponse = await fallbackOpenAI(fullSystemPrompt, historyFormatted, text)
            modelUsed = 'gpt-4o-mini'
        } catch (openAiError) {
            console.error("OpenAI Fallback failed:", openAiError)
            await sendWhatsAppMessage(from, "[DEBUG] Erreur IA Globale:\nGemini: " + String(geminiError).substring(0, 100) + "\nOpenAI: " + String(openAiError).substring(0, 100))
            throw openAiError
        }
    }

    // ─── [7] PROFILAGE SILENCIEUX ────────────────────────────────────
    const profileUpdate = await extractLeadProfile(text, aiResponse, contact)
    if (Object.keys(profileUpdate).length > 0) {
        await supabase
            .from('Profil_Prospects')
            .upsert({
                chat_id: from,
                ...profileUpdate,
                date_derniere_activite: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                nombre_interactions: (contact?.nombre_interactions ?? 0) + 1,
            }, { onConflict: 'chat_id' })
    }

    // ─── [8] ALERTE TELEGRAM LEAD CHAUD ─────────────────────────────
    const newScore = profileUpdate.score_engagement
    if (newScore && newScore >= 80 && (contact?.score_engagement ?? 0) < 80) {
        await sendTelegramAlert(buildLeadChaudAlert({
            prenom: profileUpdate.prenom ?? contact?.prenom,
            profil_type: profileUpdate.profil_type ?? contact?.profil_type,
            programme_recommande: profileUpdate.programme_recommande ?? contact?.programme_recommande,
            etape_parcours: profileUpdate.etape_parcours ?? contact?.etape_parcours,
            score_engagement: newScore,
            chat_id: from,
        }))
    }

    // ─── [9] ENVOI RÉPONSE WHATSAPP ──────────────────────────────────
    await sendWhatsAppMessage(from, aiResponse)

    // ─── [10] LOG IA ─────────────────────────────────────────────────
    await supabase.from('messages').insert({
        conversation_id: conversationId,
        contact_chat_id: from,
        direction: 'outbound',
        message_type: 'text',
        body: aiResponse,
        is_ai_response: true,
    })

    await supabase.from('ai_logs').insert({
        conversation_id: conversationId,
        contact_chat_id: from,
        user_message: text,
        chunks_retrieved: chunks,
        similarity_threshold: similarityThreshold,
        system_prompt: fullSystemPrompt.slice(0, 2000),
        llm_response: aiResponse,
        llm_model: modelUsed,
        processing_time_ms: Date.now() - startTime,
        was_escalated: false,
    })
}

// ─── Escalade quand l'IA ne sait pas répondre ────────────────────
async function handleNoContextEscalation(
    from: string,
    conversationId: string,
    supabase: ReturnType<typeof createAdminClient>
) {
    const escalationMessage = `Je n'ai pas l'information pour ça en ce moment. Je transmets votre demande ` +
        `à l'équipe BloLab qui vous répondra très bientôt.`

    await sendWhatsAppMessage(from, escalationMessage)

    await supabase
        .from('conversations')
        .update({ status: 'escalated' })
        .eq('id', conversationId)

    await supabase.from('messages').insert({
        conversation_id: conversationId,
        contact_chat_id: from,
        direction: 'outbound',
        message_type: 'text',
        body: escalationMessage,
        is_ai_response: true,
    })
}

// ─── Fallback OpenAI si Gemini échoue ───────────────────────────
async function fallbackOpenAI(
    systemPrompt: string,
    history: any[],
    userMessage: string
): Promise<string> {
    const messages = [
        { role: 'system', content: systemPrompt },
        ...history.map((h: any) => ({
            role: h.role === 'model' ? 'assistant' : 'user',
            content: h.parts[0].text,
        })),
        { role: 'user', content: userMessage },
    ]

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: 'gpt-4o-mini', messages, max_tokens: 500, temperature: 0.7 }),
    })

    if (!res.ok) {
        const errText = await res.text()
        throw new Error(`OpenAI API status ${res.status}: ${errText}`)
    }

    const data = await res.json()
    return data.choices?.[0]?.message?.content ?? "Je rencontre un problème technique, veuillez réessayer."
}

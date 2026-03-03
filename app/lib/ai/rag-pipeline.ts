import { GoogleGenerativeAI, FunctionDeclaration, Type, FunctionCall } from '@google/generative-ai'
import { createAdminClient } from '@/lib/supabase/server'
import { sendWhatsAppMessage } from '@/lib/wasender/client'
import { sendTelegramAlert, buildLeadChaudAlert } from '@/lib/notifications/telegram'
import { BLOLAB_SYSTEM_PROMPT } from '@/lib/ai/prompts'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!)

/** Embedding via fetch REST Gemini v1beta */
async function getEmbedding(text: string): Promise<number[]> {
    const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY!
    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${key}"
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: { parts: [{ text }] } }),
    })
    const json = await res.json() as any
    if (!res.ok) throw new Error("Gemini embedding error: " + JSON.stringify(json))
    return json.embedding.values
}

// --- DEFINITION DES OUTILS ----------------------------------------------

const searchKnowledgeDeclaration: FunctionDeclaration = {
    name: 'search_blolab_knowledge',
    description: 'Recherche des informations sur BloLab, ses programmes ou tarifs.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            query: { type: Type.STRING, description: 'La question ou les mots-clés à rechercher' }
        },
        required: ['query'],
    },
}

const createCrmProfileDeclaration: FunctionDeclaration = {
    name: 'create_crm_profile',
    description: 'Utiliser au TOUT PREMIER CONTACT uniquement. Crée un nouveau prospect en base de données.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            prenom: { type: Type.STRING },
            nom: { type: Type.STRING },
            age: { type: Type.STRING },
            profil_type: { type: Type.STRING, description: '\"Enfant\", \"Parent\", \"Pro\", \"Etudiant\"' },
            interet_principal: { type: Type.STRING },
            objectif: { type: Type.STRING },
            notes: { type: Type.STRING }
        },
        required: [],
    },
}

const updateCrmProfileDeclaration: FunctionDeclaration = {
    name: 'update_crm_profile',
    description: 'Utiliser dès le 2ème message. Met à jour les informations du prospect existant.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            prenom: { type: Type.STRING },
            age: { type: Type.STRING },
            profil_type: { type: Type.STRING },
            interet_principal: { type: Type.STRING },
            niveau_actuel: { type: Type.STRING },
            disponibilite: { type: Type.STRING },
            objectif: { type: Type.STRING },
            budget_mentionne: { type: Type.STRING },
            objections: { type: Type.STRING },
            programme_recommande: { type: Type.STRING },
            statut_conversation: { type: Type.STRING, description: '\"Nouveau\"|\"Qualifie\"|\"Proposition faite\"|\"Interesse\"|\"Inscription\"|\"Froid\"' },
            score_engagement: { type: Type.NUMBER, description: '0 à 100' },
            notes: { type: Type.STRING }
        },
        required: [],
    },
}

const sendTelegramAlertDeclaration: FunctionDeclaration = {
    name: 'send_telegram_alert',
    description: 'Alerter l\'équipe humaine (alerte invisible pour le prospect).',
    parameters: {
        type: Type.OBJECT,
        properties: {
            message: { type: Type.STRING, description: 'Message d\'alerte pour l\'équipe' }
        },
        required: ['message'],
    },
}

const tools = [{
    functionDeclarations: [
        searchKnowledgeDeclaration,
        createCrmProfileDeclaration,
        updateCrmProfileDeclaration,
        sendTelegramAlertDeclaration
    ]
}]

// --- IMPLEMENTATION DES OUTILS (EXECUTION) ------------------------------

async function executeToolCall(supabase: any, from: string, call: FunctionCall): Promise<any> {
    const args = call.args as Record<string, any>

    if (call.name === 'search_blolab_knowledge') {
        const queryEmbedding = await getEmbedding(args.query)
        const { data } = await supabase.rpc('match_documents', {
            query_embedding: queryEmbedding,
            match_threshold: 0.60,
            match_count: 5,
        })
        const text = (data || []).map((c: any) => "### Source: " + (c.metadata?.section || 'BloLab') + "\n" + c.content).join('\n\n')
        return { result: text || "Aucune information trouvée." }
    }

    if (call.name === 'create_crm_profile' || call.name === 'update_crm_profile') {
        const { data: contact } = await supabase.from('Profil_Prospects').select('nombre_interactions').eq('chat_id', from).single()
        
        await supabase.from('Profil_Prospects').upsert({
            chat_id: from,
            ...args,
            updated_at: new Date().toISOString(),
            date_derniere_activite: new Date().toISOString(),
            nombre_interactions: (contact?.nombre_interactions ?? 0) + 1,
        }, { onConflict: 'chat_id' })

        if (args.score_engagement >= 80) {
            await sendTelegramAlert(buildLeadChaudAlert({
                prenom: args.prenom,
                profil_type: args.profil_type,
                programme_recommande: args.programme_recommande,
                score_engagement: args.score_engagement,
                chat_id: from,
            }))
        }
        return { result: 'Profil inséré ou mis à jour avec succès en base de données PostgreSQL.' }
    }

    if (call.name === 'send_telegram_alert') {
        await sendTelegramAlert(args.message)
        return { result: 'Alerte envoyée.' }
    }

    return { error: 'Unknown tool' }
}

export interface RAGInput {
    from: string
    text: string
    conversationId: string
}

export async function triggerAIResponse(input: RAGInput): Promise<void> {
    const { from, text, conversationId } = input
    const startTime = Date.now()
    const supabase = createAdminClient()

    // --- [1] HISTORIQUE DE CONVERSATION -----------------------------
    const { data: history } = await supabase
        .from('messages')
        .select('direction, body, timestamp')
        .eq('conversation_id', conversationId)
        .eq('message_type', 'text')
        .order('timestamp', { ascending: false })
        .limit(10)

    let historyFormatted = (history ?? [])
        .reverse()
        .map((m) => ({
            role: m.direction === 'inbound' ? 'user' : 'model',
            parts: [{ text: m.body ?? '' }],
        }))

    while (historyFormatted.length > 0 && historyFormatted[0].role !== 'user') {
        historyFormatted.shift()
    }

    const validHistory: any[] = []
    let expectedRole = 'user'
    for (const msg of historyFormatted) {
        if (msg.role === expectedRole) {
            validHistory.push(msg)
            expectedRole = expectedRole === 'user' ? 'model' : 'user'
        } else {
            if (validHistory.length > 0) {
                validHistory[validHistory.length - 1].parts[0].text += '\n\n' + msg.parts[0].text
            }
        }
    }
    historyFormatted = validHistory

    // --- [2] CONTEXTE PROFIL ---------------------------------------
    const { data: contact } = await supabase.from('Profil_Prospects').select('*').eq('chat_id', from).single()
    const promptContact = contact ? "\n## CRM Actuel de "":\n" + JSON.stringify(contact, null, 2) : ''

    const fullSystemPrompt = BLOLAB_SYSTEM_PROMPT + promptContact

    // --- [3] BOUCLE D'AGENT GEMINI --------------------------------
    let aiResponse = ''
    try {
        const chatModel = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            systemInstruction: fullSystemPrompt,
            tools: tools
        })
        const chat = chatModel.startChat({ history: historyFormatted })

        let result = await chat.sendMessage(text)
        let callCount = 0

        // Si l'IA veut appeler une fonction, on entre dans la boucle
        while (result.response.functionCalls() && callCount < 4) {
            callCount++
            const calls = result.response.functionCalls()!
            const functionResponses = []

            for (const call of calls) {
                try {
                    const apiResponse = await executeToolCall(supabase, from, call)
                    functionResponses.push({
                        functionResponse: {
                            name: call.name,
                            response: apiResponse
                        }
                    })
                } catch (err: any) {
                    functionResponses.push({
                        functionResponse: { name: call.name, response: { error: err.toString() } }
                    })
                }
            }

            // On renvoie le résultat des outils à l'IA pour qu'elle continue sa réflexion
            result = await chat.sendMessage(functionResponses)
        }

        aiResponse = result.response.text()

    } catch (err: any) {
        console.error("Agent error:", err)
        aiResponse = "Je rencontre un problème technique, veuillez réessayer. (DEBUG: " + String(err).substring(0, 100) + ")"
        await sendWhatsAppMessage(from, "[DEBUG AGENT]: " + String(err).substring(0, 200))
    }

    // --- [4] ENVOI DU MESSAGE FINAL WHATSAPP ----------------------
    if (aiResponse) {
        await sendWhatsAppMessage(from, aiResponse)
        await supabase.from('messages').insert({
            conversation_id: conversationId,
            contact_chat_id: from,
            direction: 'outbound',
            message_type: 'text',
            body: aiResponse,
            is_ai_response: true,
        })
    }
}

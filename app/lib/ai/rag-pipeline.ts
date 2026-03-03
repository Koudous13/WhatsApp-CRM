import OpenAI from 'openai'
import { createAdminClient } from '@/lib/supabase/server'
import { sendWhatsAppMessage } from '@/lib/wasender/client'
import { sendTelegramAlert, buildLeadChaudAlert } from '@/lib/notifications/telegram'
import { BLOLAB_SYSTEM_PROMPT } from '@/lib/ai/prompts'

const openai = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: process.env.DEEPSEEK_API_KEY || ''
})

/** Embedding via fetch REST Gemini v1beta */
async function getEmbedding(text: string): Promise<number[]> {
    const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY!
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${key}`
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

const tools: any = [
    {
        type: "function",
        function: {
            name: "search_blolab_knowledge",
            description: "Recherche des informations sur BloLab, ses programmes ou tarifs.",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string", description: "La question ou les mots-clés à rechercher" }
                },
                required: ["query"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "create_crm_profile",
            description: "Utiliser au TOUT PREMIER CONTACT uniquement. Crée un nouveau prospect en base de données.",
            parameters: {
                type: "object",
                properties: {
                    prenom: { type: "string" },
                    nom: { type: "string" },
                    age: { type: "string" },
                    profil_type: { type: "string", description: '\"Enfant\", \"Parent\", \"Pro\", \"Etudiant\"' },
                    interet_principal: { type: "string" },
                    objectif: { type: "string" },
                    notes: { type: "string" }
                },
                required: []
            }
        }
    },
    {
        type: "function",
        function: {
            name: "update_crm_profile",
            description: "Utiliser dès le 2ème message. Met à jour les informations du prospect existant.",
            parameters: {
                type: "object",
                properties: {
                    prenom: { type: "string" },
                    age: { type: "string" },
                    profil_type: { type: "string" },
                    interet_principal: { type: "string" },
                    niveau_actuel: { type: "string" },
                    disponibilite: { type: "string" },
                    objectif: { type: "string" },
                    budget_mentionne: { type: "string" },
                    objections: { type: "string" },
                    programme_recommande: { type: "string" },
                    statut_conversation: { type: "string", description: '\"Nouveau\"|\"Qualifie\"|\"Proposition faite\"|\"Interesse\"|\"Inscription\"|\"Froid\"' },
                    score_engagement: { type: "number", description: '0 à 100' },
                    notes: { type: "string" }
                },
                required: []
            }
        }
    },
    {
        type: "function",
        function: {
            name: "send_telegram_alert",
            description: "Alerter l'équipe humaine (alerte invisible pour le prospect).",
            parameters: {
                type: "object",
                properties: {
                    message: { type: "string", description: "Message d'alerte pour l'équipe" }
                },
                required: ["message"]
            }
        }
    }
];

// --- IMPLEMENTATION DES OUTILS (EXECUTION) ------------------------------

async function executeToolCall(supabase: any, from: string, name: string, args: Record<string, any>): Promise<any> {
    if (name === 'search_blolab_knowledge') {
        const queryEmbedding = await getEmbedding(args.query)
        const { data } = await supabase.rpc('match_documents', {
            query_embedding: queryEmbedding,
            match_threshold: 0.60,
            match_count: 5,
        })
        const text = (data || []).map((c: any) => "### Source: " + (c.metadata?.section || 'BloLab') + "\n" + c.content).join('\n\n')
        return { result: text || "Aucune information trouvée." }
    }

    if (name === 'create_crm_profile' || name === 'update_crm_profile') {
        const { data: contact } = await supabase.from('Profil_Prospects').select('nombre_interactions').eq('chat_id', from).single()

        await supabase.from('Profil_Prospects').upsert({
            chat_id: from,
            ...args,
            updated_at: new Date().toISOString(),
            date_derniere_activite: new Date().toISOString(),
            nombre_interactions: (contact?.nombre_interactions ?? 0) + 1,
        }, { onConflict: 'chat_id' })

        if (args.score_engagement && args.score_engagement >= 80) {
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

    if (name === 'send_telegram_alert') {
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

    let historyFormatted: any[] = (history ?? [])
        .reverse()
        .map((m) => ({
            role: m.direction === 'inbound' ? 'user' : 'assistant',
            content: m.body ?? '',
        }))

    // Conserver uniquement les messages valides
    while (historyFormatted.length > 0 && historyFormatted[0].role !== 'user') {
        historyFormatted.shift()
    }

    // --- [2] CONTEXTE PROFIL ---------------------------------------
    const { data: contact } = await supabase.from('Profil_Prospects').select('*').eq('chat_id', from).single()
    const promptContact = contact ? `\n## CRM Actuel de "${from}":\n` + JSON.stringify(contact, null, 2) : ''

    const fullSystemPrompt = BLOLAB_SYSTEM_PROMPT + promptContact

    // --- [3] BOUCLE D'AGENT DEEPSEEK --------------------------------
    let aiResponse = ''
    try {
        let messagesContext: any[] = [
            { role: 'system', content: fullSystemPrompt },
            ...historyFormatted,
            { role: 'user', content: text }
        ];

        let callCount = 0
        let traceOutilsInfos = ""

        // DUMP LOG DE DÉBOGAGE
        await supabase.from('ai_logs').insert({
            contact_chat_id: from,
            system_prompt: JSON.stringify(messagesContext, null, 2),
            user_message: "DUMP CONTEXTE DEEPSEEK"
        })

        while (callCount < 4) {
            const response = await openai.chat.completions.create({
                model: "deepseek-chat",
                messages: messagesContext,
                tools: tools,
                temperature: 0.7,
            });

            const responseMessage = response.choices[0].message;
            messagesContext.push(responseMessage);

            if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
                callCount++;
                for (const toolCallRaw of responseMessage.tool_calls) {
                    const toolCall: any = toolCallRaw;
                    const functionName = toolCall.function.name;
                    const functionArgs = JSON.parse(toolCall.function.arguments);
                    traceOutilsInfos += ` [TOOL: ${functionName}] `;

                    try {
                        const apiResponse = await executeToolCall(supabase, from, functionName, functionArgs);
                        messagesContext.push({
                            tool_call_id: toolCall.id,
                            role: "tool",
                            name: functionName,
                            content: JSON.stringify(apiResponse),
                        });
                    } catch (err: any) {
                        traceOutilsInfos += ` [ERR_TOOL: ${err.toString()}] `;
                        messagesContext.push({
                            tool_call_id: toolCall.id,
                            role: "tool",
                            name: functionName,
                            content: JSON.stringify({ error: err.toString() }),
                        });
                    }
                }
            } else {
                // Terminé
                aiResponse = responseMessage.content || "";
                break;
            }
        }

        if (traceOutilsInfos !== "") { aiResponse += "\n\n(Debug Tools :" + traceOutilsInfos + ")" }

    } catch (err: any) {
        console.error("Agent error:", err)
        aiResponse = "Je rencontre un problème technique, veuillez réessayer. (DEBUG: " + String(err).substring(0, 100) + ")"
        await sendWhatsAppMessage(from, "[DEBUG AGENT]: " + String(err).substring(0, 200))
    }

    // --- [4] ENVOI DU MESSAGE FINAL WHATSAPP ----------------------
    if (aiResponse) {
        await sendWhatsAppMessage(from, aiResponse)

        // Log in Supabase messages
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

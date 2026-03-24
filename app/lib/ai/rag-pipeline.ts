import OpenAI from 'openai'
import { createAdminClient } from '@/lib/supabase/server'
import { sendWhatsAppMessage } from '@/lib/wasender/client'
import { sendTelegramAlert, buildLeadChaudAlert } from '@/lib/notifications/telegram'
import { BLOLAB_SYSTEM_PROMPT } from '@/lib/ai/prompts'

const openai = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: process.env.DEEPSEEK_API_KEY || ''
})

import { generateEmbedding } from '@/lib/ai/embeddings'

/** Le pipeline RAG utilise désormais le service d'embedding partagé */
const getEmbedding = generateEmbedding;

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
            name: "manage_crm_profile",
            description: "OBLIGATOIRE au premier contact dès qu'on connait le prénom OU dès que le prospect donne des infos (âge, developpement web, niveau). Insère ou met à jour le profil dans la base.",
            parameters: {
                type: "object",
                properties: {
                    prenom: { type: "string" },
                    nom: { type: "string" },
                    age: { type: "string" },
                    profil_type: { type: "string", description: '\"Enfant\", \"Parent\", \"Pro\", \"Etudiant\"' },
                    interet_principal: { type: "string", description: 'Ex: Developpement web' },
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
    },
    {
        type: "function",
        function: {
            name: "register_inscription",
            description: "APPELER UNIQUEMENT quand TOUS les champs obligatoires ont été collectés pendant la conversation et que le prospect confirme vouloir s'inscrire. Enregistre l'inscription dans la base de données et notifie l'équipe admin.",
            parameters: {
                type: "object",
                properties: {
                    prenom: { type: "string", description: "Prénom du prospect" },
                    nom: { type: "string", description: "Nom de famille" },
                    email: { type: "string", description: "Adresse email" },
                    age: { type: "string", description: "Âge en années" },
                    sexe: { type: "string", description: "Masculin ou Féminin" },
                    nationalite: { type: "string", description: "Nationalité" },
                    telephone: { type: "string", description: "Numéro de téléphone fonctionnel" },
                    niveau_etude: { type: "string", description: "Primaire / Collège / Lycée / Université / Professionnel" },
                    interet: { type: "string", description: "Ce qui l'intéresse chez BloLab" },
                    programme_choisi: { type: "string", description: "ClassTech / Ecole229 / KMC / Incubateur / FabLab" },
                    motivation: { type: "string", description: "Pourquoi veut-il s'inscrire" },
                    comment_connu: { type: "string", description: "Comment a-t-il entendu parler de BloLab" },
                    financeur_nom: { type: "string", description: "Nom de la personne qui finance la formation" },
                    financeur_email: { type: "string", description: "Email du financeur" },
                    financeur_telephone: { type: "string", description: "Téléphone du financeur" },
                    notes_agent: { type: "string", description: "Résumé de la conversation et observations de l'agent" }
                },
                required: ["prenom", "programme_choisi"]
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

    if (name === 'manage_crm_profile') {
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

    if (name === 'register_inscription') {
        // Appel de l'API inscription/create
        const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'https://whatsapp-crm-blolabparakou.vercel.app'
        try {
            const res = await fetch(`${appUrl}/api/inscription/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...args, chat_id: from }),
            })
            const data = await res.json()
            if (!res.ok) {
                return { error: data.error || 'Erreur lors de l\'inscription' }
            }
            return { result: `Inscription enregistrée avec succès. ID: ${data.inscriptionId}. Message: ${data.message}` }
        } catch (err: any) {
            return { error: `Erreur réseau: ${err.message}` }
        }
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

    // On utilise le prompt statique (la version dynamique en interface est désactivée pour le moment)
    const fullSystemPrompt = BLOLAB_SYSTEM_PROMPT + promptContact

    // --- [3] BOUCLE D'AGENT DEEPSEEK --------------------------------
    let aiResponse = ''
    try {
        let messagesContext: any[] = [
            { role: 'system', content: fullSystemPrompt },
            ...historyFormatted
        ];

        // ANTI-DOUBLON DEEPSEEK : Deepseek perd sa capacité à appeler des outils 
        // si on lui passe deux fois exactement le même message avec le rôle "user" à la fin du tableau.
        if (messagesContext.length === 1 || messagesContext[messagesContext.length - 1].content !== text) {
            messagesContext.push({ role: 'user', content: text });
        }

        let callCount = 0

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

                    try {
                        const apiResponse = await executeToolCall(supabase, from, functionName, functionArgs);
                        messagesContext.push({
                            tool_call_id: toolCall.id,
                            role: "tool",
                            name: functionName,
                            content: JSON.stringify(apiResponse),
                        });
                    } catch (err: any) {
                        console.error('Erreur Tool Calling:', err);
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
        // FIN DE LA BOUCLE DEEPSEEK

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

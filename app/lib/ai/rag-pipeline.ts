import OpenAI from 'openai'
import { createAdminClient } from '@/lib/supabase/server'
import { sendWhatsAppMessage, sendWhatsAppPoll } from '@/lib/wasender/client'
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
            name: "get_programme_requirements",
            description: "A appeler dès que le prospect choisit un programme spécifique pour savoir exactement quelles questions lui poser avant l'inscription.",
            parameters: {
                type: "object",
                properties: {
                    programme_slug: { type: "string", description: "Le slug du programme (ex: ecole229, classtech, empowher, futurmakers)" }
                },
                required: ["programme_slug"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "register_inscription",
            description: "APPELER UNIQUEMENT quand toutes les questions requises par get_programme_requirements ont été posées et répondues. Enregistre l'inscription dans la base de données spécifique au programme.",
            parameters: {
                type: "object",
                properties: {
                    programme_slug: { type: "string", description: "Le slug du programme" },
                    donnees: { 
                        type: "object", 
                        description: "Objet clé-valeur JSON contenant exactement les réponses du prospect pour les champs demandés (ex: {\"prenom\": \"Paul\", \"parcours\": \"Web\"})" 
                    }
                },
                required: ["programme_slug", "donnees"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "send_poll_message",
            description: "OBLIGATOIRE pour toute question à choix multiples ou à choix unique. Envoie un vrai sondage WhatsApp natif. À utiliser systématiquement quand un champ a des options définies.",
            parameters: {
                type: "object",
                properties: {
                    question: { type: "string", description: "La question à poser" },
                    options: { 
                        type: "array", 
                        items: { type: "string" },
                        description: "La liste des choix possibles" 
                    },
                    multi_select: { type: "boolean", description: "true si plusieurs réponses sont possibles, false (choix unique) par défaut" }
                },
                required: ["question", "options"]
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

    if (name === 'get_programme_requirements') {
        // 1. Charger les champs du programme (avec question_label)
        const { data, error } = await supabase
            .from('programmes')
            .select(`nom, slug, programme_champs(name, type, is_required, question_label, display_order)`)
            .eq('slug', args.programme_slug.toLowerCase())
            .single()
        
        if (error || !data) return { error: "⚠️ Programme non trouvé dans la base. Demande au prospect de préciser le nom du programme." }

        // 2. Charger le profil connu du prospect
        const { data: profile } = await supabase
            .from('Profil_Prospects')
            .select('prenom, nom')
            .eq('chat_id', from)
            .single()

        const knownPrenom = profile?.prenom || null
        const knownNom = profile?.nom || null

        // 3. Patterns pour détecter les champs à auto-remplir
        const phonePatterns = ['tel', 'phone', 'numero', 'whatsapp', 'chat_id', 'contact', 'portable', 'mobile']
        const prenomPatterns = ['prenom', 'prénom', 'first_name', 'firstname', 'given_name']
        const nomPatterns = ['nom', 'last_name', 'lastname', 'surname', 'family_name']

        const already_known: Record<string, any> = {}
        const champsToAsk: any[] = []

        const sortedChamps = (data.programme_champs as any[])
            .sort((a: any, b: any) => (a.display_order || 0) - (b.display_order || 0))

        for (const f of sortedChamps) {
            const sql_key = f.name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()
            const lowerKey = sql_key.toLowerCase()

            // Auto-remplir champs téléphone avec le numéro WhatsApp
            if (phonePatterns.some(p => lowerKey.includes(p))) {
                already_known[sql_key] = from
                continue
            }

            // Auto-remplir prénom si connu
            if (prenomPatterns.some(p => lowerKey.includes(p)) && knownPrenom) {
                already_known[sql_key] = knownPrenom
                continue
            }

            // Auto-remplir nom si connu
            if (nomPatterns.some(p => lowerKey.includes(p)) && knownNom) {
                already_known[sql_key] = knownNom
                continue
            }

            champsToAsk.push({
                display_name: f.name,
                question_label: f.question_label || null, // Formulation exacte définie par l'admin
                sql_key,
                type: f.type,
                is_required: f.is_required
            })
        }

        const autofillInfo = Object.keys(already_known).length > 0
            ? `Les données suivantes sont déjà connues et seront auto-remplies (NE PAS poser ces questions) : ${JSON.stringify(already_known)}`
            : 'Aucune donnée pré-remplie.'

        return { 
            instruction: `Pour inscrire ce prospect à ${data.nom}, pose les ${champsToAsk.length} questions de "champs_a_collecter" UNE PAR UNE. Attends la réponse avant de poser la suivante. ${autofillInfo}. Pour chaque champ : si "question_label" est renseigné, utilise-le tel quel ; sinon reformule "display_name" naturellement. Dans register_inscription, utilise le "sql_key" EXACT comme clé JSON, et inclus aussi les données de "already_known" dans "donnees".`,
            champs_a_collecter: champsToAsk,
            already_known,
            nombre_questions: champsToAsk.length
        }
    }

    if (name === 'register_inscription') {
        try {
            const slug = args.programme_slug.toLowerCase()
            const safeSlug = slug.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase()
            const tableName = `inscript_${safeSlug}`

            // --- NIVEAU 1 : Récupérer les vraies colonnes de la table depuis information_schema ---
            // Cela permet de filtrer les clés inventées ou mal mappées par l'IA
            const columnCheckSql = `SELECT column_name FROM information_schema.columns WHERE table_name = '${tableName}' AND table_schema = 'public';`
            const { data: colData, error: colError } = await supabase.rpc('admin_execute_sql', { sql_query: columnCheckSql })
            
            const validColumns: Set<string> = new Set(['chat_id', 'status', 'id', 'created_at'])
            if (!colError && colData) {
                // admin_execute_sql retourne un tableau de lignes
                const rows = Array.isArray(colData) ? colData : JSON.parse(colData)
                rows.forEach((r: any) => {
                    const colName = r.column_name || r['column_name']
                    if (colName) validColumns.add(colName)
                })
            }
            console.log(`[DEBUG] Colonnes valides pour ${tableName}:`, [...validColumns])

            // --- Construction de insertData avec sanitisation ---
            const rawData: Record<string, any> = {
                chat_id: from,
                status: 'pending',
            }
            if (args.donnees) {
                for (const [key, value] of Object.entries(args.donnees)) {
                    const safeKey = key.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()
                    rawData[safeKey] = value
                }
            }

            // --- NIVEAU 1 : Filtrer : ne garder que les colonnes qui existent réellement ---
            // Si information_schema a retourné des colonnes, on filtre. Sinon on insère tout (fallback).
            const insertData: Record<string, any> = validColumns.size > 4
                ? Object.fromEntries(Object.entries(rawData).filter(([k]) => validColumns.has(k)))
                : rawData

            // Colonnes ignorées (inventées par l'IA)
            const ignoredKeys = Object.keys(rawData).filter(k => !validColumns.has(k) && k !== 'chat_id' && k !== 'status')
            if (ignoredKeys.length > 0) {
                console.warn(`[WARN] register_inscription: colonnes ignorées car inexistantes dans ${tableName}:`, ignoredKeys)
            }

            // --- SQL INSERT direct pour contourner le cache PostgREST ---
            const allColumns = Object.keys(insertData)
            const columnsSql = allColumns.map(c => `"${c}"`).join(', ')
            const valuesSql = allColumns.map(col => {
                const val = insertData[col]
                if (val === undefined || val === null) return 'NULL'
                if (typeof val === 'number') return val
                return `'${String(val).replace(/'/g, "''")}'`
            }).join(', ')

            const updateSet = allColumns
                .filter(c => c !== 'chat_id' && c !== 'id')
                .map(c => `"${c}" = EXCLUDED."${c}"`)
                .join(', ')

            const insertSql = `
                INSERT INTO "${tableName}" (${columnsSql})
                VALUES (${valuesSql})
                ON CONFLICT (chat_id) DO UPDATE SET ${updateSet};
            `

            const { error: sqlError } = await supabase.rpc('admin_execute_sql', { sql_query: insertSql })

            if (sqlError) {
                console.error('[ERROR] register_inscription SQL failed:', sqlError, 'Data:', insertData)
                await sendTelegramAlert(
                    `⚠️ ALERTE INSCRIPTION ${slug.toUpperCase()} - Problème technique\n\nProspect: ${insertData.prenom || insertData.nom || ''}\nTéléphone: ${from}\nEmail: ${insertData.email || 'N/A'}\n\nErreur: "${sqlError.message}"\n\nDonnées fournies:\n${Object.entries(insertData).filter(([k]) => !['chat_id','status'].includes(k)).map(([k,v]) => `- ${k}: ${v}`).join('\n')}`
                )
                return { error: `Erreur lors de l'enregistrement : ${sqlError.message}. L'équipe a été alertée.` }
            }

            await sendTelegramAlert(`✅ Nouvelle inscription [${slug}] : ${insertData.prenom || ''} ${insertData.nom || ''} (${from})`)
            return { result: "Inscription réussie et enregistrée ! Tu peux maintenant féliciter le prospect chaleureusement." }
        } catch (err: any) {
            console.error('[ERROR] register_inscription exception:', err)
            return { error: `Erreur interne : ${err.message}` }
        }
    }

    if (name === 'send_poll_message') {
        try {
            await sendWhatsAppPoll(
                from,
                args.question,
                args.options,
                args.multi_select ?? false
            )
            return { result: `Poll envoyé avec succès. Attends la réponse de l'utilisateur — elle arrivera comme un message texte dans la conversation. NE réponds PAS encore, laisse l'utilisateur voter.` }
        } catch (err: any) {
            console.error('[ERROR] send_poll_message:', err)
            // Fallback : si le poll échoue, on envoie un texte avec les options
            const optionsText = (args.options as string[]).map((o: string, i: number) => `${i + 1}. ${o}`).join('\n')
            await sendWhatsAppMessage(from, `${args.question}\n\n${optionsText}`)
            return { result: 'Poll indisponible, options envoyées en texte.' }
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
        .limit(30)

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

    // --- [2.5] RECUPERATION DYNAMIQUE DES PROGRAMMES ---------------
    const { data: activeProgrammes } = await supabase.from('programmes').select('nom, slug')
    const promptProgrammes = activeProgrammes && activeProgrammes.length > 0
        ? `\n## 📝 RÈGLE CRITIQUE — MAPPING DES SLUGS (PROGRAMMES ACTIFS)\nVoici la liste dynamique des programmes actuellement ouverts et leurs slugs respectifs.\nQuand tu appelles \`get_programme_requirements\` ou \`register_inscription\`, tu dois TOUJOURS utiliser l'un de ces slugs EXACTS en fonction du choix du prospect :\n` + activeProgrammes.map(p => `- S'il veut faire "${p.nom}" → utilise le slug : "${p.slug}"`).join('\n')
        : '\n## 📝 PROGRAMMES : Aucun programme actif trouvé en base.'

    // On utilise le prompt statique et on y accole les données fraîches
    const fullSystemPrompt = BLOLAB_SYSTEM_PROMPT + promptProgrammes + promptContact

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

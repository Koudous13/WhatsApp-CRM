import { sendWhatsAppMessage } from '@/lib/wasender/client'

export type Variant = {
    id: string
    body: string
    ratio: number
}

export type AudienceFilters = {
    programme?: string | string[]
    opt_in?: boolean
    has_csv?: boolean
    segment_id?: string | null
    segment_filters?: {
        programmes: string[]
        statuts: string[]
        scoreMin: number
        scoreMax: number
    }
}

export async function getAudience(supabase: any, filters: AudienceFilters, csvData?: any[]) {
    let audience: { chat_id: string, metadata?: any }[] = []

    if (filters.has_csv && csvData && csvData.length > 0) {
        audience = csvData.map((row: any) => ({
            chat_id: row.phone || row.Phone || row.whatsapp || row.chat_id || row.telephone || row.Telephone || row.numero || row.Numero || row.Numéro,
            metadata: row
        })).filter((a: any) => a.chat_id)
    } else if (filters.segment_id && filters.segment_filters) {
        const sf = filters.segment_filters
        let query = supabase
            .from('Profil_Prospects')
            .select('chat_id, prenom, nom, programme_recommande, statut_conversation, ville, objectif, budget_mentionne, score_engagement')
        
        if (filters.opt_in !== false) query = query.eq('opt_in', true)
        if (sf.programmes && sf.programmes.length > 0) query = query.in('programme_recommande', sf.programmes)
        if (sf.statuts && sf.statuts.length > 0) query = query.in('statut_conversation', sf.statuts)
        if (sf.scoreMin > 0) query = query.gte('score_engagement', sf.scoreMin)
        if (sf.scoreMax < 100) query = query.lte('score_engagement', sf.scoreMax)
        
        const { data: recipients, error: segError } = await query
        if (segError) throw new Error(`Erreur segment: ${segError.message}`)
        
        audience = (recipients || []).map(r => ({
            chat_id: r.chat_id,
            metadata: {
                Prenom: r.prenom || '',
                Nom: r.nom || '',
                Programme: r.programme_recommande || '',
                Statut: r.statut_conversation || '',
                Ville: r.ville || '',
                Objectif: r.objectif || '',
                Budget: r.budget_mentionne || '',
                ScoreEngagement: String(r.score_engagement || 0),
            }
        }))
    } else {
        let customDataMap = new Map()
        let singleProgrammeName = ''
        
        if (Array.isArray(filters.programme) && filters.programme.length === 1) {
            singleProgrammeName = filters.programme[0]
        } else if (typeof filters.programme === 'string' && filters.programme !== 'Tous') {
            singleProgrammeName = filters.programme
        }

        if (singleProgrammeName) {
            const { data: prog } = await supabase.from('programmes').select('slug').eq('nom', singleProgrammeName).single()
            if (prog && prog.slug) {
                const tableName = `inscript_${prog.slug.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase()}`
                const { data: customRows } = await supabase.from(tableName).select('*')
                if (customRows) {
                    customRows.forEach((row: any) => {
                        if (row.chat_id) customDataMap.set(String(row.chat_id).replace(/\D/g, ''), row)
                    })
                }
            }
        }

        let query = supabase
            .from('Profil_Prospects')
            .select('chat_id, prenom, nom, programme_recommande, statut_conversation, ville, objectif, budget_mentionne, score_engagement')
        
        if (filters.opt_in !== false) query = query.eq('opt_in', true)
        if (Array.isArray(filters.programme) && filters.programme.length > 0) {
            query = query.in('programme_recommande', filters.programme)
        } else if (typeof filters.programme === 'string' && filters.programme !== 'Tous') {
            query = query.eq('programme_recommande', filters.programme)
        }
        
        const { data: recipients, error: queryError } = await query
        if (queryError) throw new Error(`Erreur requête: ${queryError.message}`)

        audience = (recipients || []).map(r => {
            const baseMetadata = {
                Prenom: r.prenom || '',
                Nom: r.nom || '',
                Programme: r.programme_recommande || '',
                Statut: r.statut_conversation || '',
                Ville: r.ville || '',
                Objectif: r.objectif || '',
                Budget: r.budget_mentionne || '',
                ScoreEngagement: String(r.score_engagement || 0),
            }
            const customData = customDataMap.get(r.chat_id) || {}
            
            return {
                chat_id: r.chat_id,
                metadata: { ...baseMetadata, ...customData }
            }
        })
    }

    return audience
}

export async function sendAdvancedBroadcast(
    campaignId: string,
    variants: Variant[],
    audience: { chat_id: string, metadata?: any }[],
    supabase: any
) {
    let sent = 0
    let failed = 0

    for (let i = 0; i < audience.length; i++) {
        const person = audience[i]
        const chatId = String(person.chat_id)

        // Choix de la variante
        const random = Math.random() * 100
        let cumulative = 0
        let selectedVariant = variants[0]
        for (const v of variants) {
            cumulative += v.ratio
            if (random <= cumulative) {
                selectedVariant = v
                break
            }
        }

        // Remplacement sécurisé des tags
        let personalizedBody = selectedVariant.body
        if (person.metadata) {
            Object.entries(person.metadata).forEach(([key, val]) => {
                const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                personalizedBody = personalizedBody.replace(new RegExp(`\\{${escapedKey}\\}`, 'gi'), String(val || ''))
            })
        }

        try {
            console.log(`[Broadcast ${campaignId}] Envoi à ${chatId} (${i + 1}/${audience.length})`);
            await sendWhatsAppMessage(chatId, personalizedBody)
            sent++

            // Enregistrer le message dans l'inbox (conversation + message outbound)
            const conversationId = await ensureConversation(supabase, chatId)
            if (conversationId) {
                await supabase.from('messages').insert({
                    conversation_id: conversationId,
                    contact_chat_id: chatId,
                    direction: 'outbound',
                    message_type: 'text',
                    body: personalizedBody,
                    is_ai_response: false,
                    delivery_status: 'sent',
                })
            }

            await supabase.from('ai_logs').insert({
                contact_chat_id: chatId,
                user_message: `BROADCAST OK: ${i + 1}/${audience.length}`,
                system_prompt: `Campagne: ${campaignId}`
            })
        } catch (err: any) {
            console.error(`[Broadcast ${campaignId}] Échec pour ${chatId}:`, err);
            failed++

            await supabase.from('ai_logs').insert({
                contact_chat_id: chatId,
                user_message: `BROADCAST ÉCHEC: ${String(err).substring(0, 100)}`,
                system_prompt: `Campagne: ${campaignId}`
            })
        }

        // Progression live après chaque itération (UI polling lit ces champs)
        await supabase.from('broadcasts')
            .update({
                sent_count: sent,
                delivered_count: sent,
                failed_count: failed,
            })
            .eq('id', campaignId)

        // Rate limiting anti-ban
        if (i < audience.length - 1) {
            await new Promise(r => setTimeout(r, 5500))
        }
    }

    // Mise à jour finale
    await supabase.from('broadcasts')
        .update({
            status: 'completed',
            sent_count: sent,
            failed_count: failed,
            delivered_count: sent,
            sent_at: new Date().toISOString(),
        })
        .eq('id', campaignId)

    await supabase.from('ai_logs').insert({
        contact_chat_id: 'SYSTEM_BROADCAST',
        user_message: `FIN CAMPAGNE: ${campaignId}`,
        system_prompt: `Total: ${sent}/${audience.length} envoyés.`
    })
}

async function ensureConversation(supabase: any, chatId: string): Promise<string | null> {
    const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .eq('contact_chat_id', chatId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    if (existing?.id) return existing.id

    const { data: created, error } = await supabase
        .from('conversations')
        .insert({ contact_chat_id: chatId, status: 'ai_active' })
        .select('id')
        .single()

    if (error) {
        console.error(`[Broadcast] Impossible de créer la conversation pour ${chatId}:`, error)
        return null
    }
    return created.id
}

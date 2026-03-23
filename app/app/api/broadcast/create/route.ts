import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendWhatsAppMessage } from '@/lib/wasender/client'
import { waitUntil } from '@vercel/functions'

type Variant = {
    id: string
    body: string
    ratio: number
}

type SegmentFilters = {
    programmes: string[]
    statuts: string[]
    scoreMin: number
    scoreMax: number
}

export async function POST(req: NextRequest) {
    try {
        const { 
            name, 
            variants, 
            filterProgramme, 
            filterOptIn, 
            csvData, 
            scheduledAt,
            selectedSegmentId,
            segmentFilters
        } = await req.json()
        
        if (!name || !variants || variants.length === 0) {
            return NextResponse.json({ error: 'Nom et au moins une variante requis' }, { status: 400 })
        }

        const supabase = createAdminClient()

        // 1. Déterminer l'audience
        let audience: { chat_id: string, metadata?: any }[] = []

        if (csvData && csvData.length > 0) {
            audience = csvData.map((row: any) => ({
                chat_id: row.phone || row.Phone || row.whatsapp || row.chat_id || row.telephone || row.Telephone || row.numero || row.Numero || row.Numéro,
                metadata: row
            })).filter((a: any) => a.chat_id)
        } else if (selectedSegmentId && segmentFilters) {
            const sf: SegmentFilters = segmentFilters
            let query = supabase
                .from('Profil_Prospects')
                .select('chat_id, prenom, nom, programme_recommande, statut_conversation, ville, objectif, budget_mentionne, score_engagement')
            
            if (filterOptIn !== false) query = query.eq('opt_in', true)
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
            let query = supabase
                .from('Profil_Prospects')
                .select('chat_id, prenom, nom, programme_recommande, statut_conversation, ville, objectif, budget_mentionne, score_engagement')
            
            if (filterOptIn !== false) query = query.eq('opt_in', true)
            if (Array.isArray(filterProgramme) && filterProgramme.length > 0) {
                query = query.in('programme_recommande', filterProgramme)
            } else if (typeof filterProgramme === 'string' && filterProgramme !== 'Tous') {
                query = query.eq('programme_recommande', filterProgramme)
            }
            
            const { data: recipients, error: queryError } = await query
            if (queryError) throw new Error(`Erreur requête: ${queryError.message}`)

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
        }

        if (!audience.length) {
            return NextResponse.json({ 
                error: 'Aucun destinataire trouvé.' 
            }, { status: 400 })
        }

        console.log(`[Broadcast] Lancement de la campagne "${name}" pour ${audience.length} destinataires.`);

        const { data: campaign, error } = await supabase
            .from('broadcasts')
            .insert({
                name,
                body: variants[0].body,
                status: scheduledAt ? 'scheduled' : 'running',
                total_recipients: audience.length,
                scheduled_at: scheduledAt || null,
                audience_filters: { 
                    programme: filterProgramme, 
                    opt_in: filterOptIn, 
                    has_csv: !!csvData,
                    segment_id: selectedSegmentId || null,
                },
            })
            .select()
            .single()

        if (error) throw error

        if (scheduledAt) {
            console.log(`[Broadcast] Campagne planifiée pour le ${scheduledAt}`);
            return NextResponse.json({ ok: true, scheduled: true, campaignId: campaign.id })
        }

        // On lance le processus en arrière-plan sans bloquer la requête
        waitUntil(sendAdvancedBroadcast(campaign.id, variants, audience, supabase))

        return NextResponse.json({ ok: true, campaignId: campaign.id, total: audience.length })

    } catch (err: any) {
        console.error('Fatal Broadcast Error:', err)
        return NextResponse.json({ error: err.message || 'Une erreur inattendue est survenue' }, { status: 500 })
    }
}

async function sendAdvancedBroadcast(
    campaignId: string,
    variants: Variant[],
    audience: { chat_id: string, metadata?: any }[],
    supabase: any
) {
    let sent = 0
    let failed = 0

    for (let i = 0; i < audience.length; i++) {
        const person = audience[i]
        
        // Choix de la variante selon le ratio (N-Split)
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

        // Remplacement sécurisé des tags dynamiques {Tag}
        let personalizedBody = selectedVariant.body
        if (person.metadata) {
            Object.entries(person.metadata).forEach(([key, val]) => {
                // Échapper les caractères spéciaux de la clé pour la Regex
                const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                const regex = new RegExp(`\\{${escapedKey}\\}`, 'gi')
                personalizedBody = personalizedBody.replace(regex, String(val || ''))
            })
        }

        try {
            console.log(`[Broadcast ${campaignId}] Envoi à ${person.chat_id} (${i + 1}/${audience.length})`);
            await sendWhatsAppMessage(String(person.chat_id), personalizedBody)
            sent++
        } catch (err) {
            console.error(`[Broadcast ${campaignId}] Échec pour ${person.chat_id}:`, err);
            failed++
        }

        // Mise à jour progressive du compteur dans la DB toutes les 10 personnes ou à la fin
        if (sent % 10 === 0 || i === audience.length - 1) {
            await supabase.from('broadcasts')
                .update({ 
                    sent_count: sent, 
                    failed_count: failed,
                    delivered_count: sent 
                })
                .eq('id', campaignId)
        }

        // Rate limiting anti-ban (2s par message)
        if (i < audience.length - 1) {
            await new Promise(r => setTimeout(r, 2000))
        }
    }

    // Update final stats
    await supabase.from('broadcasts')
        .update({
            status: 'completed',
            sent_count: sent,
            delivered_count: sent, // approximation — à affiner avec les webhooks de livraison
            failed_count: failed,
            sent_at: new Date().toISOString(),
        })
        .eq('id', campaignId)
}

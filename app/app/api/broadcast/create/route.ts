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
                chat_id: row.phone || row.Phone || row.whatsapp || row.chat_id,
                metadata: row
            })).filter((a: any) => a.chat_id)
        } else if (selectedSegmentId && segmentFilters) {
            const sf: SegmentFilters = segmentFilters
            let query = supabase
                .from('Profil_Prospects')
                .select('chat_id, prenom, nom, programme_recommande, programme_souhaite, statut_conversation, ville, objectif, budget_mentionne, score_engagement')
            
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
                    Programme: r.programme_recommande || r.programme_souhaite || '',
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
                .select('chat_id, prenom, nom, programme_recommande, programme_souhaite, statut_conversation, ville, objectif, budget_mentionne, score_engagement')
            
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
                    Programme: r.programme_recommande || r.programme_souhaite || '',
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
            return NextResponse.json({ ok: true, scheduled: true, campaignId: campaign.id })
        }

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

    for (const person of audience) {
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

        // Remplacement des tags dynamiques {Tag} — insensible à la casse
        let personalizedBody = selectedVariant.body
        if (person.metadata) {
            Object.entries(person.metadata).forEach(([key, val]) => {
                const regex = new RegExp(`\\{${key}\\}`, 'gi')
                personalizedBody = personalizedBody.replace(regex, String(val || ''))
            })
        }

        try {
            await sendWhatsAppMessage(person.chat_id, personalizedBody)
            sent++
        } catch {
            failed++
        }

        // Rate limiting anti-ban (2s par message)
        await new Promise(r => setTimeout(r, 2000))
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

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { Variant, AudienceFilters, getAudience, sendAdvancedBroadcast } from '@/lib/broadcast/sender'

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

        const filters: AudienceFilters = {
            programme: filterProgramme,
            opt_in: filterOptIn,
            has_csv: !!(csvData && csvData.length > 0),
            segment_id: selectedSegmentId || null,
            segment_filters: segmentFilters
        }

        // 1. Déterminer l'audience
        const audience = await getAudience(supabase, filters, csvData)

        if (!audience.length) {
            return NextResponse.json({ 
                error: 'Aucun destinataire trouvé.' 
            }, { status: 400 })
        }

        console.log(`[Broadcast] Lancement de la campagne "${name}" pour ${audience.length} destinataires.`);
        
        // LOG DIAGNOSTIC
        await supabase.from('ai_logs').insert({
            contact_chat_id: 'SYSTEM_BROADCAST',
            user_message: `DÉBUT CAMPAGNE: ${name}`,
            system_prompt: JSON.stringify({ audience_count: audience.length, variants_count: variants.length })
        })

        const { data: campaign, error } = await supabase
            .from('broadcasts')
            .insert({
                name,
                body: variants[0].body,
                status: scheduledAt ? 'scheduled' : 'running',
                total_recipients: audience.length,
                scheduled_at: scheduledAt || null,
                audience_filters: filters,
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



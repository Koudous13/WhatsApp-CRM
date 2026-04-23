import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getAudience, sendAdvancedBroadcast, AudienceFilters } from '@/lib/broadcast/sender'
import { waitUntil } from '@vercel/functions'

export async function GET(req: NextRequest) {
    // Sécurisation basique pour cron-job.org
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const supabase = createAdminClient()

        // Récupérer les broadcasts planifiés dont l'heure est venue
        const { data: scheduledBroadcasts, error } = await supabase
            .from('broadcasts')
            .select('*')
            .eq('status', 'scheduled')
            .lte('scheduled_at', new Date().toISOString())

        if (error) throw error

        if (!scheduledBroadcasts || scheduledBroadcasts.length === 0) {
            return NextResponse.json({ ok: true, message: 'Rien à exécuter' })
        }

        console.log(`[Tick] ${scheduledBroadcasts.length} broadcasts à lancer...`)

        for (const broadcast of scheduledBroadcasts) {
            try {
                // 1. Recalculer l'audience
                const filters = broadcast.audience_filters as AudienceFilters
                const audience = await getAudience(supabase, filters)

                // 2. Mettre à jour le broadcast
                await supabase.from('broadcasts')
                    .update({ 
                        status: 'running',
                        total_recipients: audience.length
                    })
                    .eq('id', broadcast.id)

                // 3. Lancer l'envoi en arrière-plan
                if (audience.length > 0) {
                    // On recrée un objet Variant factice car body est unique dans les anciens broadcasts,
                    // Mais si on supporte A/B sur les séquences plus tard, on l'aura dans le body ou une table dédiée.
                    // Pour l'instant, on utilise le body principal
                    const variants = [{ id: '1', body: broadcast.body, ratio: 100 }]
                    waitUntil(sendAdvancedBroadcast(broadcast.id, variants, audience, supabase))
                } else {
                    await supabase.from('broadcasts')
                        .update({ status: 'completed', sent_count: 0, failed_count: 0, delivered_count: 0 })
                        .eq('id', broadcast.id)
                }
            } catch (err) {
                console.error(`[Tick] Erreur lancement broadcast ${broadcast.id}:`, err)
            }
        }

        return NextResponse.json({ ok: true, executed: scheduledBroadcasts.length })
    } catch (err: any) {
        console.error('[Tick] Erreur critique:', err)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}

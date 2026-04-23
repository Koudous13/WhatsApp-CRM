import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getAudience, sendAdvancedBroadcast, AudienceFilters } from '@/lib/broadcast/sender'
import { waitUntil } from '@vercel/functions'

export async function POST(req: NextRequest) {
    try {
        const { name, programme_nom, startDate, steps, filterOptIn } = await req.json()

        if (!name || !programme_nom || !startDate || !steps || steps.length === 0) {
            return NextResponse.json({ error: 'Données invalides' }, { status: 400 })
        }

        const supabase = createAdminClient()

        // 1. Créer la séquence
        const { data: sequence, error: seqError } = await supabase
            .from('broadcast_sequences')
            .insert({ 
                name, 
                programme_nom, 
                steps, 
                start_date: startDate 
            })
            .select()
            .single()

        if (seqError) throw seqError

        const start = new Date(startDate)
        const now = new Date()

        const audienceFilters: AudienceFilters = {
            programme: [programme_nom],
            opt_in: filterOptIn !== false,
            has_csv: false,
            segment_id: null
        }

        // 2. Créer chaque broadcast
        for (let i = 0; i < steps.length; i++) {
            const step = steps[i]
            const stepDate = new Date(start.getTime() + step.offsetDays * 24 * 60 * 60 * 1000)
            
            // Appliquer l'heure d'envoi spécifique si fournie
            if (step.sendTime) {
                const [hours, minutes] = step.sendTime.split(':').map(Number)
                stepDate.setHours(hours, minutes, 0, 0)
            }

            const isImmediate = stepDate <= now

            // Pour l'immédiat, on doit évaluer l'audience locale
            let initialRecipientsCount = 0
            let localAudience: any[] = []

            if (isImmediate) {
                localAudience = await getAudience(supabase, audienceFilters)
                initialRecipientsCount = localAudience.length
            }

            const { data: campaign, error: bcError } = await supabase
                .from('broadcasts')
                .insert({
                    name: `${name} - Étape ${i + 1} (J+${step.offsetDays})`,
                    body: step.body,
                    status: isImmediate ? 'running' : 'scheduled',
                    total_recipients: initialRecipientsCount,
                    scheduled_at: isImmediate ? null : stepDate.toISOString(),
                    audience_filters: audienceFilters,
                    sequence_id: sequence.id,
                    sequence_step_index: i
                })
                .select()
                .single()

            if (bcError) throw bcError

            if (isImmediate && localAudience.length > 0) {
                const variants = [{ id: '1', body: step.body, ratio: 100 }]
                waitUntil(sendAdvancedBroadcast(campaign.id, variants, localAudience, supabase))
            }
        }

        return NextResponse.json({ ok: true, sequenceId: sequence.id })

    } catch (err: any) {
        console.error('Sequence Error:', err)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}

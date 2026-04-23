import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getAudience, sendAdvancedBroadcast, AudienceFilters } from '@/lib/broadcast/sender'
import { waitUntil } from '@vercel/functions'

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const { name, programme_nom, startDate, steps, filterOptIn } = await req.json()

        if (!id || !name || !programme_nom || !startDate || !steps || steps.length === 0) {
            return NextResponse.json({ error: 'Données invalides' }, { status: 400 })
        }

        const supabase = createAdminClient()

        // 1. Mettre à jour la séquence
        const { error: seqError } = await supabase
            .from('broadcast_sequences')
            .update({ 
                name, 
                programme_nom, 
                steps, 
                start_date: startDate 
            })
            .eq('id', id)

        if (seqError) throw seqError

        const start = new Date(startDate)
        const now = new Date()

        const audienceFilters: AudienceFilters = {
            programme: [programme_nom],
            opt_in: filterOptIn !== false,
            has_csv: false,
            segment_id: null
        }

        // 2. Récupérer les diffusions existantes de la séquence
        const { data: existingBroadcasts } = await supabase
            .from('broadcasts')
            .select('id, sequence_step_index, status')
            .eq('sequence_id', id)

        const broadcastsByStep = new Map()
        existingBroadcasts?.forEach(b => {
            broadcastsByStep.set(b.sequence_step_index, b)
        })

        // 3. Synchroniser chaque étape
        for (let i = 0; i < steps.length; i++) {
            const step = steps[i]
            const stepDate = new Date(start.getTime() + step.offsetDays * 24 * 60 * 60 * 1000)
            
            if (step.sendTime) {
                const [hours, minutes] = step.sendTime.split(':').map(Number)
                stepDate.setHours(hours, minutes, 0, 0)
            }

            const existing = broadcastsByStep.get(i)
            const isImmediate = stepDate <= now

            if (existing) {
                // Si l'étape existe déjà et n'est pas encore envoyée, on la met à jour
                if (existing.status === 'scheduled') {
                    const { error: updateError } = await supabase
                        .from('broadcasts')
                        .update({
                            name: `${name} - Étape ${i + 1} (J+${step.offsetDays})`,
                            body: step.body,
                            status: isImmediate ? 'running' : 'scheduled',
                            scheduled_at: isImmediate ? null : stepDate.toISOString(),
                        })
                        .eq('id', existing.id)
                    
                    if (updateError) throw updateError

                    if (isImmediate) {
                        const localAudience = await getAudience(supabase, audienceFilters)
                        const variants = [{ id: '1', body: step.body, ratio: 100 }]
                        waitUntil(sendAdvancedBroadcast(existing.id, variants, localAudience, supabase))
                    }
                }
            } else {
                // Si l'étape n'existe pas, on la crée
                if (!isImmediate) {
                    const { error: insError } = await supabase
                        .from('broadcasts')
                        .insert({
                            name: `${name} - Étape ${i + 1} (J+${step.offsetDays})`,
                            body: step.body,
                            status: 'scheduled',
                            total_recipients: 0,
                            scheduled_at: stepDate.toISOString(),
                            audience_filters: audienceFilters,
                            sequence_id: id,
                            sequence_step_index: i
                        })
                    if (insError) throw insError
                }
            }
        }

        // 4. (Optionnel) Supprimer les étapes en trop si la nouvelle séquence est plus courte
        const maxStepIndex = steps.length - 1
        await supabase
            .from('broadcasts')
            .delete()
            .eq('sequence_id', id)
            .eq('status', 'scheduled')
            .gt('sequence_step_index', maxStepIndex)

        return NextResponse.json({ ok: true })

    } catch (err: any) {
        console.error('Sequence Update Error:', err)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const supabase = createAdminClient()

        // Supprimer la séquence (Cascade supprimera les diffusions)
        const { error } = await supabase
            .from('broadcast_sequences')
            .delete()
            .eq('id', id)

        if (error) throw error

        return NextResponse.json({ ok: true })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}

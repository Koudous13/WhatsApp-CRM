import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendWhatsAppMessage } from '@/lib/wasender/client'

export async function POST(req: NextRequest) {
    const { name, body, filterProgramme, filterOptIn } = await req.json()
    if (!name || !body) {
        return NextResponse.json({ error: 'Nom et message requis' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Récupérer les destinataires selon les filtres
    let query = supabase.from('Profil_Prospects').select('chat_id')
    if (filterOptIn) query = query.eq('opt_in', true)
    if (filterProgramme && filterProgramme !== 'Tous') {
        query = query.eq('programme_recommande', filterProgramme)
    }
    const { data: recipients } = await query

    if (!recipients?.length) {
        return NextResponse.json({ error: 'Aucun destinataire trouvé' }, { status: 400 })
    }

    // Créer la campagne
    const { data: campaign, error } = await supabase
        .from('broadcasts')
        .insert({
            name,
            body,
            status: 'running',
            total_recipients: recipients.length,
            audience_filters: { programme: filterProgramme, opt_in: filterOptIn },
        })
        .select()
        .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Insérer les recipients dans broadcast_recipients
    const recipientRows = recipients.map(r => ({
        broadcast_id: campaign.id,
        contact_chat_id: r.chat_id,
        status: 'pending',
    }))
    await supabase.from('broadcast_recipients').insert(recipientRows)

    // Envoi rate-limité en background (ne pas bloquer la réponse)
    sendBroadcastAsync(campaign.id, body, recipients.map(r => r.chat_id), supabase)

    return NextResponse.json({ ok: true, campaignId: campaign.id, total: recipients.length })
}

async function sendBroadcastAsync(
    campaignId: string,
    body: string,
    chatIds: string[],
    supabase: ReturnType<typeof createAdminClient>
) {
    let sent = 0
    let failed = 0

    for (const chatId of chatIds) {
        try {
            await sendWhatsAppMessage(chatId, body)
            sent++
            await supabase.from('broadcast_recipients')
                .update({ status: 'sent', sent_at: new Date().toISOString() })
                .eq('broadcast_id', campaignId)
                .eq('contact_chat_id', chatId)
        } catch {
            failed++
            await supabase.from('broadcast_recipients')
                .update({ status: 'failed' })
                .eq('broadcast_id', campaignId)
                .eq('contact_chat_id', chatId)
        }

        // Rate limiting : attendre 1.5 secondes entre chaque message
        await new Promise(r => setTimeout(r, 1500))
    }

    // Update stats finale
    await supabase.from('broadcasts')
        .update({
            status: failed > sent ? 'failed' : 'completed',
            sent_count: sent,
            failed_count: failed,
            sent_at: new Date().toISOString(),
        })
        .eq('id', campaignId)
}

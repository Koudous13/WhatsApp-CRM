import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendWhatsAppMessage } from '@/lib/wasender/client'

export async function POST(req: NextRequest) {
    const { to, text, conversationId } = await req.json()
    if (!to || !text || !conversationId) {
        return NextResponse.json({ error: 'Champs manquants' }, { status: 400 })
    }

    // Envoyer via WaSenderAPI
    await sendWhatsAppMessage(to, text)

    // Enregistrer en base + passer la conversation en 'assigned'
    const supabase = createAdminClient()
    await Promise.all([
        supabase.from('messages').insert({
            conversation_id: conversationId,
            contact_chat_id: to,
            direction: 'outbound',
            message_type: 'text',
            body: text,
            is_ai_response: false,
            delivery_status: 'sent',
        }),
        supabase.from('conversations').update({ status: 'assigned' }).eq('id', conversationId),
    ])

    return NextResponse.json({ ok: true })
}

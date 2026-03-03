import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
    try {
        const { conversationId } = await req.json()
        if (!conversationId) {
            return NextResponse.json({ error: 'ID de conversation manquant' }, { status: 400 })
        }

        const supabase = createAdminClient()

        // Repasser le statut à 'ai_active' pour que l'IA réponde au prochain message entrant
        const { error } = await supabase
            .from('conversations')
            .update({ status: 'ai_active' })
            .eq('id', conversationId)

        if (error) throw error

        return NextResponse.json({ ok: true })
    } catch (err: any) {
        console.error('Erreur Handover IA:', err)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}

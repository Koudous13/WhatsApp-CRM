import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
    try {
        const { id, name, scheduledAt, variants } = await req.json()
        if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 })

        const supabase = createAdminClient()
        
        // On ne peut modifier que si c'est encore 'scheduled' ou 'draft'
        const { data: campaign } = await supabase.from('broadcasts').select('status').eq('id', id).single()
        
        if (campaign?.status !== 'scheduled') {
            return NextResponse.json({ error: 'Seules les campagnes planifiées peuvent être modifiées' }, { status: 400 })
        }

        const { error } = await supabase
            .from('broadcasts')
            .update({
                name,
                scheduled_at: scheduledAt || null,
                body: variants?.[0]?.body // Simplification pour l'instant
            })
            .eq('id', id)

        if (error) throw error

        return NextResponse.json({ ok: true })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

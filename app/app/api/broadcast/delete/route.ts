import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function DELETE(req: NextRequest) {
    try {
        const { id } = await req.json()
        if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 })

        const supabase = createAdminClient()
        const { error } = await supabase
            .from('broadcasts')
            .delete()
            .eq('id', id)

        if (error) throw error

        return NextResponse.json({ ok: true })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

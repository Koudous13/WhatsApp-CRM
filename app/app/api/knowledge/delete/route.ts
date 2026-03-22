import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function DELETE(req: NextRequest) {
    try {
        const { id } = await req.json()
        if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 })

        const supabase = createAdminClient()
        const { error } = await supabase
            .from('documents')
            .delete()
            .eq('id', id)

        if (error) throw error
        return NextResponse.json({ ok: true })
    } catch (err: any) {
        console.error('Erreur delete knowledge:', err)
        return NextResponse.json({ error: err.message || 'Erreur interne' }, { status: 500 })
    }
}

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function PUT(req: Request, { params }: { params: { id: string } }) {
    try {
        const { id } = params
        const body = await req.json()
        const { nom, description, cible } = body

        if (!nom) {
            return NextResponse.json({ error: 'Le nom du programme est requis' }, { status: 400 })
        }

        const supabase = createAdminClient()
        const { data, error } = await supabase
            .from('programmes')
            .update({ nom, description, cible })
            .eq('id', id)
            .select()
            .single()

        if (error) throw error

        return NextResponse.json(data)
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
    try {
        const { id } = params
        const supabase = createAdminClient()
        
        const { error } = await supabase
            .from('programmes')
            .delete()
            .eq('id', id)

        if (error) throw error

        return NextResponse.json({ success: true })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

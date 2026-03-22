import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET() {
    try {
        const supabase = createAdminClient()
        const { data, error } = await supabase
            .from('programmes')
            .select('*')
            .order('created_at', { ascending: true })

        if (error) throw error

        return NextResponse.json(data)
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json()
        const { nom, description, cible } = body

        if (!nom) {
            return NextResponse.json({ error: 'Le nom du programme est requis' }, { status: 400 })
        }

        const supabase = createAdminClient()
        const { data, error } = await supabase
            .from('programmes')
            .insert([{ nom, description, cible }])
            .select()
            .single()

        if (error) throw error

        return NextResponse.json(data)
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

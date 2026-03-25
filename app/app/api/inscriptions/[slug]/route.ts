import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
    try {
        const { slug } = await params
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        )

        const safeSlug = slug.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase()
        const tableName = `inscript_${safeSlug}`

        const { data, error } = await supabase
            .from(tableName)
            .select('*')
            .order('created_at', { ascending: false })

        if (error) throw error

        return NextResponse.json(data)
    } catch (error: any) {
        console.error(`Erreur GET /api/inscriptions/${await params.then(p => p.slug)}:`, error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}


export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
    try {
        const { slug } = await params
        const body = await req.json()
        
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        )

        const safeSlug = slug.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase()
        const tableName = `inscript_${safeSlug}`

        const { data, error } = await supabase
            .from(tableName)
            .insert(body)
            .select()

        if (error) {
            // Handle unique constraint on chat_id
            if (error.code === '23505') return NextResponse.json({ error: 'Ce numéro de téléphone est déjà inscrit.' }, { status: 400 })
            throw error
        }

        return NextResponse.json(data[0])
    } catch (error: any) {
        console.error(`Erreur POST /api/inscriptions/${await params.then(p => p.slug)}:`, error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

export async function PUT(req: Request, { params }: { params: Promise<{ slug: string }> }) {
    try {
        const { slug } = await params
        const body = await req.json()
        const { id, ...updateData } = body
        
        if (!id) return NextResponse.json({ error: 'ID de l\'inscrit requis' }, { status: 400 })

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        )

        const safeSlug = slug.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase()
        const tableName = `inscript_${safeSlug}`

        const { data, error } = await supabase
            .from(tableName)
            .update(updateData)
            .eq('id', id)
            .select()

        if (error) throw error

        return NextResponse.json(data[0])
    } catch (error: any) {
        console.error(`Erreur PUT /api/inscriptions/${await params.then(p => p.slug)}:`, error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ slug: string }> }) {
    try {
        const { slug } = await params
        const { searchParams } = new URL(req.url)
        const id = searchParams.get('id')
        
        if (!id) return NextResponse.json({ error: 'ID manquant' }, { status: 400 })

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        )

        const safeSlug = slug.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase()
        const tableName = `inscript_${safeSlug}`

        const { error } = await supabase
            .from(tableName)
            .delete()
            .eq('id', id)

        if (error) throw error

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error(`Erreur DELETE /api/inscriptions/${await params.then(p => p.slug)}:`, error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

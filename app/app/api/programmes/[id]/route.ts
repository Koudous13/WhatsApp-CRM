import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params
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

import { createClient } from '@supabase/supabase-js'

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params
        // Utilisation du client Supabase direct avec Service Role pour avoir le droit d'exécuter l'admin RPC
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        )
        
        // 1. Récupérer le slug du programme avant de le supprimer
        const { data: prog, error: fetchError } = await supabase
            .from('programmes')
            .select('slug')
            .eq('id', id)
            .single()

        if (fetchError || !prog) {
            return NextResponse.json({ error: 'Programme introuvable' }, { status: 404 })
        }

        const safeSlug = prog.slug.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase()
        const tableName = `inscript_${safeSlug}`

        // 2. Supprimer la table dynamique associée (DDL)
        const dropSql = `DROP TABLE IF EXISTS "${tableName}";`
        const { error: sqlError } = await supabase.rpc('admin_execute_sql', { sql_query: dropSql })

        if (sqlError) {
            console.error("Erreur lors du DROP TABLE:", sqlError)
            return NextResponse.json({ error: "Impossible de supprimer la table d'inscrits" }, { status: 500 })
        }

        // 3. Supprimer le programme (Cascades : programme_champs seront supprimés)
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

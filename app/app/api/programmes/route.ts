import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// GET : Liste tous les programmes avec leurs champs
export async function GET() {
    try {
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        )

        const { data, error } = await supabase
            .from('programmes')
            .select(`
                *,
                programme_champs(*)
            `)
            .order('created_at', { ascending: false })

        if (error) throw error

        return NextResponse.json(data)
    } catch (e: any) {
        console.error("Erreur GET /api/programmes:", e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}

// POST : Crée un programme, insère les champs, et génère la table dédiée via DDL
export async function POST(req: Request) {
    try {
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        )

        const { name, slug, fields } = await req.json()
        if (!name || !slug) return NextResponse.json({ error: 'Name et slug requis' }, { status: 400 })

        // 1. Création du programme
        const { data: progData, error: progError } = await supabase
            .from('programmes')
            .insert({ name, slug })
            .select()
            .single()

        if (progError) {
            // Gérer le doublon de slug spécifiquement
            if (progError.code === '23505') return NextResponse.json({ error: 'Ce slug existe déjà' }, { status: 400 })
            throw progError
        }

        const programmeId = progData.id

        // 2. Préparation des champs de base + champs personnalisés
        // Les champs de base sont toujours demandés par Laura
        const baseFields = [
            { programme_id: programmeId, name: 'prenom', type: 'text', is_required: true, display_order: 1 },
            { programme_id: programmeId, name: 'nom', type: 'text', is_required: true, display_order: 2 },
            { programme_id: programmeId, name: 'email', type: 'text', is_required: false, display_order: 3 }
        ]

        let customFieldsToInsert: any[] = [];
        let ddlColumns: string[] = [];

        if (fields && Array.isArray(fields)) {
            customFieldsToInsert = fields.map((f: any, idx: number) => ({
                programme_id: programmeId,
                name: f.name,
                type: f.type || 'text',
                options: f.options || null,
                is_required: f.is_required !== false,
                display_order: 4 + idx
            }))

            ddlColumns = fields.map((f: any) => {
                const sqlType = f.type === 'number' ? 'NUMERIC' : 'TEXT'
                // On met tout le reste en TEXT car Supabase gère très bien le texte, 
                // et l'IA envoie souvent du texte.
                const safeName = f.name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()
                return `"${safeName}" ${sqlType}`
            })
        }

        const allFieldsToInsert = [...baseFields, ...customFieldsToInsert]

        const { error: fieldsError } = await supabase
            .from('programme_champs')
            .insert(allFieldsToInsert)

        if (fieldsError) throw fieldsError

        // 3. Génération dynamique de la table d'inscription (DDL)
        // inscript_slug
        const safeSlug = slug.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase()
        const tableName = `inscript_${safeSlug}`

        const customColumnsSql = ddlColumns.length > 0 ? ',\n' + ddlColumns.join(',\n') : ''

        const createTableSql = `
            CREATE TABLE IF NOT EXISTS "${tableName}" (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                chat_id TEXT UNIQUE NOT NULL,
                telephone TEXT,
                prenom TEXT,
                nom TEXT,
                email TEXT,
                status TEXT DEFAULT 'pending',
                created_at TIMESTAMPTZ DEFAULT now()
                ${customColumnsSql}
            );
        `

        const { error: sqlError } = await supabase.rpc('admin_execute_sql', { sql_query: createTableSql })

        if (sqlError) {
            console.error("Erreur lors de la création de la table:", sqlError)
            throw sqlError
        }

        return NextResponse.json({ success: true, programme: progData, tableName })
    } catch (e: any) {
        console.error("Erreur POST /api/programmes:", e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}

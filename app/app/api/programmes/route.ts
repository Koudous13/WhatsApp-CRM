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

        const { nom, slug, fields, initialData } = await req.json()
        if (!nom || !slug) return NextResponse.json({ error: 'Nom et slug requis' }, { status: 400 })

        // 1. Création du programme
        const { data: progData, error: progError } = await supabase
            .from('programmes')
            .insert({ nom, slug })
            .select()
            .single()

        if (progError) {
            if (progError.code === '23505') return NextResponse.json({ error: 'Ce slug existe déjà' }, { status: 400 })
            throw progError
        }

        const programmeId = progData.id

        // 2. Préparation des champs dynamiques UNIQUEMENT
        let customFieldsToInsert: any[] = [];
        let ddlColumns: string[] = [];

        if (fields && Array.isArray(fields)) {
            customFieldsToInsert = fields.map((f: any, idx: number) => ({
                programme_id: programmeId,
                name: f.name,
                type: f.type || 'text',
                options: f.options || null,
                is_required: f.is_required !== false,
                display_order: idx + 1
            }))

            ddlColumns = fields.map((f: any) => {
                const sqlType = f.type === 'number' ? 'NUMERIC' : 'TEXT'
                const safeName = f.name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()
                return `"${safeName}" ${sqlType}`
            })
        }

        if (customFieldsToInsert.length > 0) {
            const { error: fieldsError } = await supabase
                .from('programme_champs')
                .insert(customFieldsToInsert)

            if (fieldsError) throw fieldsError
        }

        // 3. Génération dynamique de la table d'inscription (DDL)
        const safeSlug = slug.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase()
        const tableName = `inscript_${safeSlug}`

        const customColumnsSql = ddlColumns.length > 0 ? ',\n                ' + ddlColumns.join(',\n                ') : ''

        const createTableSql = `
            CREATE TABLE IF NOT EXISTS "${tableName}" (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                chat_id TEXT UNIQUE NOT NULL,
                status TEXT DEFAULT 'pending',
                created_at TIMESTAMPTZ DEFAULT now()${customColumnsSql}
            );
        `

        const { error: sqlError } = await supabase.rpc('admin_execute_sql', { sql_query: createTableSql })

        if (sqlError) {
            console.error("Erreur lors de la création de la table:", sqlError)
            throw sqlError
        }

        // 4. Insertion des données initiales depuis le CSV (Importation)
        if (initialData && Array.isArray(initialData) && initialData.length > 0) {
            // Nettoyage et préparation des lignes (ajout d'un chat_id par défaut si absent pour éviter le plantage)
            const crypto = require('crypto');
            const rowsToInsert = initialData.map(row => {
                // S'assurer qu'il y a un chat_id unique (on peut utiliser un numéro de téléphone s'il y a une colonne qui y ressemble, sinon un UUID)
                const phoneKeys = Object.keys(row).filter(k => k.toLowerCase().includes('phone') || k.toLowerCase().includes('téléphone') || k.toLowerCase().includes('tel') || k.toLowerCase() === 'numero');
                const defaultChatId = phoneKeys.length > 0 && row[phoneKeys[0]] ? String(row[phoneKeys[0]]) : crypto.randomUUID();
                
                return {
                    ...row,
                    chat_id: row.chat_id || defaultChatId,
                }
            });

            const { error: insertError } = await supabase
                .from(tableName)
                .insert(rowsToInsert)

            if (insertError) {
                console.error("Erreur lors de l'insertion en masse (initialData):", insertError)
                // On ne bloque pas la réponse, la table est créée, mais on renvoie l'erreur
                return NextResponse.json({ success: true, programme: progData, tableName, warning: "Data import failed" })
            }
        }

        return NextResponse.json({ success: true, programme: progData, tableName })
    } catch (e: any) {
        console.error("Erreur POST /api/programmes:", e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}

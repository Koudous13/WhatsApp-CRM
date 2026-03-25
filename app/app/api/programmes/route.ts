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
            console.log(`[DEBUG] Importation initiale pour ${tableName} : ${initialData.length} lignes reçues.`);
            
            // Création d'un dictionnaire de mapping : Nom Original -> Nom SQL
            const headerMapping: Record<string, string> = {}
            if (fields && Array.isArray(fields)) {
                fields.forEach(f => {
                    const safeName = f.name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()
                    headerMapping[f.name] = safeName
                })
            }
            console.log(`[DEBUG] Mapping des colonnes :`, headerMapping);

            const crypto = require('crypto');
            const rowsToInsert = initialData.map((row, idx) => {
                const newRow: any = {}
                
                // On mappe chaque champ du CSV vers sa version SQL
                Object.keys(row).forEach(originalKey => {
                    const sqlKey = headerMapping[originalKey] || originalKey.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()
                    newRow[sqlKey] = row[originalKey]
                })

                // S'assurer qu'il y a un chat_id unique
                const phoneKeys = Object.keys(newRow).filter(k => 
                    k.includes('phone') || k.includes('t_l_phone') || k.includes('tel') || k === 'numero' || k === 'chat_id' || k === 'whatsapp'
                );
                
                if (!newRow.chat_id) {
                    newRow.chat_id = phoneKeys.length > 0 && newRow[phoneKeys[0]] 
                        ? String(newRow[phoneKeys[0]]).replace(/\D/g, '') 
                        : crypto.randomUUID();
                } else {
                     newRow.chat_id = String(newRow.chat_id).replace(/\D/g, '')
                }
                
                if (idx === 0) console.log(`[DEBUG] Exemple de ligne mappée (ligne 1) :`, newRow);
                return newRow
            });

            const { data: insertResult, error: insertError } = await supabase
                .from(tableName)
                .upsert(rowsToInsert, { onConflict: 'chat_id' })
                .select()

            if (insertError) {
                console.error("[ERROR] Erreur lors de l'insertion (initialData):", insertError)
                return NextResponse.json({ 
                    success: true, 
                    programme: progData, 
                    tableName, 
                    debugInfo: {
                        rowCount: rowsToInsert.length,
                        firstRow: rowsToInsert[0],
                        error: insertError
                    },
                    warning: "Data import failed: " + insertError.message 
                })
            }
            console.log(`[DEBUG] Insertion réussie : ${insertResult?.length || 0} lignes insérées.`);
            return NextResponse.json({ 
                success: true, 
                programme: progData, 
                tableName, 
                importedCount: insertResult?.length || 0 
            })
        }

        return NextResponse.json({ success: true, programme: progData, tableName })
    } catch (e: any) {
        console.error("Erreur POST /api/programmes:", e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}

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

        // 2. Enrichir avec le nombre exact d'inscrits en lisant chaque table
        const augmentedData = await Promise.all(
            data.map(async (prog) => {
                const tableName = `inscript_${prog.slug.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase()}`;
                const { count, error: countErr } = await supabase
                    .from(tableName as any)
                    .select('*', { count: 'exact', head: true });

                return {
                    ...prog,
                    inscritsCount: countErr ? 0 : (count || 0)
                };
            })
        );

        return NextResponse.json(augmentedData)
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
                Object.keys(row).forEach(originalKey => {
                    const sqlKey = headerMapping[originalKey] || originalKey.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()
                    newRow[sqlKey] = row[originalKey]
                })

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
                return newRow
            });

            // Conversion des lignes en SQL INSERT pour contourner le cache PostgREST (Schema Cache)
            // On utilise jsonb_populate_recordset si possible, ou une construction manuelle.
            // La méthode la plus sûre sans dépendre du type est de construire la requête VALUES.
            const allColumns = Array.from(new Set(rowsToInsert.flatMap(r => Object.keys(r))));
            const columnsSql = allColumns.map(c => `"${c}"`).join(', ');

            const valuesSql = rowsToInsert.map(row => {
                const vals = allColumns.map(col => {
                    const val = row[col];
                    if (val === undefined || val === null) return 'NULL';
                    if (typeof val === 'number') return val;
                    return `'${String(val).replace(/'/g, "''")}'`;
                });
                return `(${vals.join(', ')})`;
            }).join(', ');

            const bulkInsertSql = `
                INSERT INTO "${tableName}" (${columnsSql})
                VALUES ${valuesSql}
                ON CONFLICT (chat_id) DO UPDATE SET
                ${allColumns.filter(c => c !== 'chat_id' && c !== 'id').map(c => `"${c}" = EXCLUDED."${c}"`).join(', ')};
            `;

            const { error: insertError } = await supabase.rpc('admin_execute_sql', { sql_query: bulkInsertSql });

            if (insertError) {
                console.error("[ERROR] Erreur lors de l'insertion SQL direct (initialData):", insertError)
                return NextResponse.json({
                    success: true,
                    programme: progData,
                    tableName,
                    debugInfo: {
                        rowCount: rowsToInsert.length,
                        error: insertError,
                        sql: bulkInsertSql.substring(0, 500) + "..."
                    },
                    warning: "SQL Data import failed: " + insertError.message
                })
            }

            console.log(`[DEBUG] Insertion SQL direct réussie pour ${tableName}.`);

            // --- 5. Synchronisation avec Profil_Prospects ---
            try {
                const prenomKeys = ['prenom', 'prénom', 'first_name', 'firstname', 'given_name'];
                const nomKeys = ['nom', 'last_name', 'lastname', 'family_name', 'name', 'nom_complet'];

                const profilesToUpsert = rowsToInsert.map(row => {
                    let prenom = null;
                    let nom = null;

                    for (const key of Object.keys(row)) {
                        const lowerKey = key.toLowerCase();
                        if (!prenom && prenomKeys.some(k => lowerKey.includes(k))) {
                            prenom = row[key];
                        } else if (!nom && nomKeys.some(k => lowerKey.includes(k))) {
                            nom = row[key];
                        }
                    }

                    if (!prenom && nom && String(nom).includes(' ')) {
                        const parts = String(nom).trim().split(' ');
                        prenom = parts[0];
                        nom = parts.slice(1).join(' ');
                    }

                    return {
                        chat_id: row.chat_id,
                        prenom: prenom ? String(prenom).trim().substring(0, 50) : null,
                        nom: nom ? String(nom).trim().substring(0, 50) : null,
                        profil_type: 'Inscrit',
                        programme_recommande: progData.nom,
                        statut_conversation: 'Inscription',
                        score_engagement: 80,
                        opt_in: true,
                        nombre_interactions: 1,
                        date_derniere_activite: new Date().toISOString()
                    };
                });

                const { error: syncError } = await supabase
                    .from('Profil_Prospects')
                    .upsert(profilesToUpsert, { onConflict: 'chat_id', ignoreDuplicates: true });

                if (syncError) {
                    console.error("[ERROR] Erreur de synchronisation Profil_Prospects (InitialData):", syncError);
                } else {
                    console.log(`[DEBUG] Sync Profil_Prospects réussie : ${profilesToUpsert.length} contacts mis à jour.`);
                }
            } catch (syncErr) {
                console.error("[ERROR] Exception lors de la synchronisation (InitialData):", syncErr);
            }

            return NextResponse.json({
                success: true,
                programme: progData,
                tableName,
                importedCount: rowsToInsert.length
            })
        }

        return NextResponse.json({ success: true, programme: progData, tableName })
    } catch (e: any) {
        console.error("Erreur POST /api/programmes:", e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}

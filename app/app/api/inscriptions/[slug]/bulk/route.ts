import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
    try {
        const { slug } = await params
        const { rows } = await req.json()

        if (!rows || !Array.isArray(rows) || rows.length === 0) {
            return NextResponse.json({ error: 'Aucune donnée à importer' }, { status: 400 })
        }

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        )

        const safeSlug = slug.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase()
        const tableName = `inscript_${safeSlug}`

        // 1. Récupérer les champs du programme pour le mapping
        const { data: prog, error: progErr } = await supabase
            .from('programmes')
            .select('*, programme_champs(*)')
            .eq('slug', slug)
            .single()

        if (progErr || !prog) throw new Error("Programme introuvable")

        const headerMapping: Record<string, string> = {}
        prog.programme_champs.forEach((f: any) => {
            const safeName = f.name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()
            headerMapping[f.name] = safeName
        })

        // 2. Mapper les lignes du CSV
        console.log(`[DEBUG] Bulk Import pour ${tableName} : ${rows.length} lignes reçues.`);
        const rowsToInsert = rows.map((row, idx) => {
            const newRow: any = {}

            Object.keys(row).forEach(originalKey => {
                const sqlKey = headerMapping[originalKey] || originalKey.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()
                newRow[sqlKey] = row[originalKey]
            })

            // WhatsApp / Chat ID logic
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

            if (idx === 0) console.log(`[DEBUG] Exemple de ligne mappée (Bulk) :`, newRow);
            return newRow
        });

        // Construction du SQL INSERT multi-lignes pour contourner le cache
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

        const { data: insertResult, error } = await supabase.rpc('admin_execute_sql', { sql_query: bulkInsertSql });

        if (error) {
            console.error("[ERROR] Bulk Import failed (SQL):", error);
            return NextResponse.json({
                error: error.message,
                debugInfo: {
                    rowCount: rowsToInsert.length,
                    mapping: headerMapping,
                    sql: bulkInsertSql.substring(0, 500) + "..."
                }
            }, { status: 500 })
        }

        console.log(`[DEBUG] Bulk Import SQL réussi : ${rowsToInsert.length} lignes.`);

        // --- 3. Synchronisation avec Profil_Prospects ---
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
                    programme_recommande: prog.nom,
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
                console.error("[ERROR] Erreur de synchronisation Profil_Prospects (Bulk):", syncError);
            } else {
                console.log(`[DEBUG] Sync Profil_Prospects réussie : ${profilesToUpsert.length} contacts mis à jour.`);
            }
        } catch (syncErr) {
            console.error("[ERROR] Exception lors de la synchronisation (Bulk):", syncErr);
        }

        return NextResponse.json({ success: true, count: rowsToInsert.length, data: rowsToInsert })
    } catch (error: any) {
        console.error(`Erreur POST /api/inscriptions/${await params.then(p => p.slug)}/bulk:`, error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

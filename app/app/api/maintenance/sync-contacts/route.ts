import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
    try {
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        )

        // 1. Récupérer tous les programmes actuels
        const { data: programmes, error: progErr } = await supabase
            .from('programmes')
            .select('slug, nom')

        if (progErr) throw progErr

        let totalSynchronized = 0;
        let details = [];

        // 2. Pour chaque programme, récupérer ses inscrits et les synchroniser
        for (const prog of programmes) {
            const tableName = `inscript_${prog.slug.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase()}`
            
            // On fait un appel RPC ou on essaie direct (les tables d'inscriptions sont ouvertes au service role)
            const { data: inscrits, error: inscritsErr } = await supabase
                .from(tableName as any)
                .select('*')

            if (inscritsErr) {
                details.push({ programme: prog.nom, table: tableName, error: inscritsErr.message });
                continue;
            }

            if (!inscrits || inscrits.length === 0) {
                details.push({ programme: prog.nom, table: tableName, count: 0, status: 'No data' });
                continue;
            }

            // Heuristique pour récupérer les prénoms/noms
            const prenomKeys = ['prenom', 'prénom', 'first_name', 'firstname', 'given_name'];
            const nomKeys = ['nom', 'last_name', 'lastname', 'family_name', 'name', 'nom_complet'];

            const profilesToUpsert = inscrits.map((row: any) => {
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
                };
            });

            // UPSERT avec mise a jour des profils existants — indispensable pour rattacher
            // un inscrit existant a son programme (sinon le filtre broadcast le manque).
            const { error: syncError } = await supabase
                .from('Profil_Prospects')
                .upsert(profilesToUpsert, { onConflict: 'chat_id', ignoreDuplicates: false });

            if (syncError) {
                details.push({ programme: prog.nom, table: tableName, error: syncError.message });
            } else {
                totalSynchronized += profilesToUpsert.length;
                details.push({ programme: prog.nom, table: tableName, count: profilesToUpsert.length, status: 'Success' });
            }
        }

        return NextResponse.json({ 
            success: true, 
            message: `Synchronisation terminée. ${totalSynchronized} profils affectés.`,
            totalSynchronized,
            details
        })

    } catch (error: any) {
        console.error("Erreur Sync Contacts:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

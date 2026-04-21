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

        // --- Synchronisation avec Profil_Prospects ---
        // Sans ca, le contact n'a pas de programme_recommande et le filtre broadcast
        // le renvoie a 0 destinataires. Meme pattern que POST /bulk et /api/programmes.
        try {
            const { data: prog } = await supabase
                .from('programmes')
                .select('nom')
                .eq('slug', slug)
                .maybeSingle()

            if (prog?.nom && data[0]?.chat_id) {
                const row = data[0]
                const prenomKeys = ['prenom', 'prénom', 'first_name', 'firstname', 'given_name']
                const nomKeys = ['nom', 'last_name', 'lastname', 'family_name', 'name', 'nom_complet']

                let prenom: string | null = null
                let nom: string | null = null
                for (const key of Object.keys(row)) {
                    const lowerKey = key.toLowerCase()
                    if (!prenom && prenomKeys.some(k => lowerKey.includes(k))) prenom = row[key]
                    else if (!nom && nomKeys.some(k => lowerKey.includes(k))) nom = row[key]
                }
                if (!prenom && nom && String(nom).includes(' ')) {
                    const parts = String(nom).trim().split(' ')
                    prenom = parts[0]
                    nom = parts.slice(1).join(' ')
                }

                await supabase
                    .from('Profil_Prospects')
                    .upsert({
                        chat_id: row.chat_id,
                        prenom: prenom ? String(prenom).trim().substring(0, 50) : null,
                        nom: nom ? String(nom).trim().substring(0, 50) : null,
                        profil_type: 'Inscrit',
                        programme_recommande: prog.nom,
                        statut_conversation: 'Inscription',
                        score_engagement: 80,
                        opt_in: true,
                        nombre_interactions: 1,
                        date_derniere_activite: new Date().toISOString(),
                    }, { onConflict: 'chat_id', ignoreDuplicates: false })
            }
        } catch (syncErr) {
            console.error('[ERROR] Sync Profil_Prospects (ajout individuel):', syncErr)
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

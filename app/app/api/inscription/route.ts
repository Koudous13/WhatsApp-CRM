import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

/** GET: Récupérer toutes les inscriptions pour le dashboard */
export async function GET() {
    const supabase = createAdminClient()
    const { data, error } = await supabase
        .from('Inscriptions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ inscriptions: data })
}

/** POST: Ajouter une inscription manuellement depuis le Dashboard */
export async function POST(req: Request) {
    try {
        const body = await req.json()
        const { prenom, nom, email, telephone, programme_choisi, statut } = body

        if (!prenom || !programme_choisi) {
            return NextResponse.json({ error: 'Prénom et programme requis' }, { status: 400 })
        }

        const supabase = createAdminClient()
        
        const chat_id = 'manual_' + Date.now()

        const { data, error } = await supabase
            .from('Inscriptions')
            .insert({
                chat_id,
                prenom,
                nom: nom || null,
                email: email || null,
                telephone: telephone || null,
                programme_choisi,
                statut: statut || 'en_attente'
            })
            .select()
            .single()

        if (error) throw error

        return NextResponse.json(data)
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

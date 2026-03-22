import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendTelegramAlert } from '@/lib/notifications/telegram'

/** API Route appelée par n8n/Function Calling pour enregistrer une inscription */
export async function POST(req: NextRequest) {
    const body = await req.json()

    const {
        chat_id,
        prenom,
        nom,
        email,
        age,
        sexe,
        nationalite,
        telephone,
        niveau_etude,
        interet,
        programme_choisi,
        motivation,
        comment_connu,
        financeur_nom,
        financeur_email,
        financeur_telephone,
        notes_agent,
    } = body

    // Validation minimale
    if (!chat_id || !prenom || !programme_choisi) {
        return NextResponse.json(
            { error: 'chat_id, prenom et programme_choisi sont requis' },
            { status: 400 }
        )
    }

    const supabase = createAdminClient()

    // 1. Enregistrer l'inscription
    const { data: inscription, error } = await supabase
        .from('Inscriptions')
        .insert({
            chat_id,
            prenom,
            nom: nom || null,
            email: email || null,
            age: age ? parseInt(age) : null,
            sexe: sexe || null,
            nationalite: nationalite || null,
            telephone: telephone || null,
            niveau_etude: niveau_etude || null,
            interet: interet || null,
            programme_choisi,
            motivation: motivation || null,
            comment_connu: comment_connu || null,
            financeur_nom: financeur_nom || null,
            financeur_email: financeur_email || null,
            financeur_telephone: financeur_telephone || null,
            notes_agent: notes_agent || null,
            statut: 'en_attente',
        })
        .select()
        .single()

    if (error) {
        console.error('[Inscription] Erreur Supabase:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // 2. Mettre à jour le statut du prospect dans Profil_Prospects
    await supabase
        .from('Profil_Prospects')
        .update({ 
            statut_conversation: 'Inscription',
            etape_parcours: 'Inscrit',
        })
        .eq('chat_id', chat_id)

    // 3. Notifier l'admin via Telegram
    const telegramMsg = buildInscriptionAlert({
        prenom,
        nom,
        programme_choisi,
        telephone,
        email,
        financeur_nom,
        chat_id,
        inscriptionId: inscription.id,
    })
    await sendTelegramAlert(telegramMsg)

    return NextResponse.json({
        ok: true,
        inscriptionId: inscription.id,
        message: `Inscription de ${prenom} au programme ${programme_choisi} enregistrée avec succès.`,
    })
}

/** Récupère toutes les inscriptions (pour l'admin CRM) */
export async function GET() {
    const supabase = createAdminClient()
    const { data, error } = await supabase
        .from('Inscriptions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ inscriptions: data })
}

function buildInscriptionAlert(params: {
    prenom: string
    nom?: string
    programme_choisi: string
    telephone?: string
    email?: string
    financeur_nom?: string
    chat_id: string
    inscriptionId: string
}) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'https://whatsapp-crm-blolabparakou.vercel.app'
    const inboxUrl = `${appUrl}/inbox?chat_id=${params.chat_id}`

    return (
        `🎉 *NOUVELLE INSCRIPTION — BloLab*\n\n` +
        `👤 *Nom:* ${params.prenom} ${params.nom ?? ''}\n` +
        `🎓 *Programme:* ${params.programme_choisi}\n` +
        `📱 *Téléphone:* ${params.telephone ?? 'Non renseigné'}\n` +
        `📧 *Email:* ${params.email ?? 'Non renseigné'}\n` +
        `💳 *Financeur:* ${params.financeur_nom ?? 'Lui-même'}\n\n` +
        `📋 *ID Inscription:* ${params.inscriptionId}\n\n` +
        `👉 [Voir la conversation](${inboxUrl})`
    )
}

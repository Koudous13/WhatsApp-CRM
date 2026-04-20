import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createHmac } from 'crypto'
import { createAdminClient } from '@/lib/supabase/server'
import { triggerAIResponse } from '@/lib/ai/rag-pipeline'
import { sendWhatsAppMessage } from '@/lib/wasender/client'

/** Valide la signature HMAC-SHA256 du webhook WaSenderAPI */
function validateHmac(body: string, signature: string): boolean {
    const secret = process.env.WASENDER_WEBHOOK_SECRET
    if (!secret || !signature) return false
    const expected = createHmac('sha256', secret).update(body).digest('hex')
    // Comparaison insensible à la casse
    return signature.toLowerCase() === expected.toLowerCase()
}

export async function POST(req: NextRequest) {
    // ─── Validation HMAC ──────────────────────────────────────────
    const rawBody = await req.text()

    // 🔥 DEBUG EXTRÊME : On enregistre TOUT ce qui touche l'URL du webhook
    const supabaseDebug = createAdminClient()
    await supabaseDebug.from('ai_logs').insert({
        contact_chat_id: 'DEBUG_WEBHOOK',
        user_message: rawBody.substring(0, 5000),
        system_prompt: `Headers: ${JSON.stringify(Object.fromEntries(req.headers))}`,
    })

    // WaSenderAPI envoie X-Webhook-Signature (pas x-wasender-signature)
    const signature = req.headers.get('x-webhook-signature')
        ?? req.headers.get('x-wasender-signature')
        ?? ''

    let payload: any
    try {
        payload = JSON.parse(rawBody)
    } catch {
        return NextResponse.json({ error: 'Bad Request' }, { status: 400 })
    }

    // AUCUNE VERIFICATION STRICTE D'EVENT ICI POUR DEBUG
    // (L'ancien bloc validEvents a été retiré temporairement)

    // Event de test → répondre OK immédiatement
    if (payload?.event === 'webhook.test') {
        console.log('[Webhook] Test reçu ✅')
        return NextResponse.json({ ok: true, message: 'BloLab webhook online' })
    }

    const event = payload?.event
    const data = payload?.data

    // ─── Mise à jour statut livraison ─────────────────────────────
    if (event === 'messages.update') {
        await handleDeliveryUpdate(data)
        return NextResponse.json({ ok: true })
    }

    // ─── Gestion des votes de poll ───────────────────────────────────────
    if (event === 'poll.results') {
        waitUntil(handlePollResult(data))
        return NextResponse.json({ ok: true })
    }

    if (event !== 'messages.upsert' && event !== 'messages.received') {
        return NextResponse.json({ ok: true }) // Ignorer les autres events
    }

    // ─── Extraction du message ────────────────────────────────────
    // WaSenderAPI peut envoyer `messages` comme un tableau (upsert) ou un objet (received)
    let msgObj = Array.isArray(data?.messages) ? data?.messages[0] : data?.messages
    if (!msgObj) {
        return NextResponse.json({ ok: true })
    }

    const isFromMe = msgObj?.key?.fromMe ?? msgObj?.fromMe ?? false
    if (isFromMe) {
        return NextResponse.json({ ok: true }) // Ignorer nos propres messages
    }

    // Pour récupérer le numéro de téléphone, privilégier senderPn ou tout ce qui a `@s.whatsapp.net` (WaSenderAPI peut envoyer un @lid)
    const senderPn = msgObj?.key?.senderPn ?? msgObj?.senderPn
    const remoteJid = msgObj?.key?.remoteJid ?? msgObj?.remoteJid

    let rawRemoteJid = ''
    if (senderPn && senderPn.includes('@s.whatsapp.net')) rawRemoteJid = senderPn
    else if (remoteJid && remoteJid.includes('@s.whatsapp.net')) rawRemoteJid = remoteJid
    else rawRemoteJid = senderPn || remoteJid || ''

    const from: string = rawRemoteJid.replace('@s.whatsapp.net', '').replace('@lid', '')

    const messageId: string = msgObj?.key?.id ?? msgObj?.id ?? ''
    const messageType: string = msgObj?.messageType ?? (msgObj?.message ? Object.keys(msgObj.message)[0] : 'unknown')
    const body: string = msgObj?.message?.conversation
        ?? msgObj?.messageBody
        ?? msgObj?.message?.extendedTextMessage?.text
        ?? ''

    if (!from || !body) return NextResponse.json({ ok: true })

    const supabase = createAdminClient()

    // ─── Upsert Profil_Prospects ──────────────────────────────────
    await supabase
        .from('Profil_Prospects')
        .upsert({ chat_id: from, opt_in: true }, { onConflict: 'chat_id', ignoreDuplicates: true })

    // ─── Upsert Conversation ──────────────────────────────────────
    const { data: existingConv } = await supabase
        .from('conversations')
        .select('id, status')
        .eq('contact_chat_id', from)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

    let conversationId: string
    if (existingConv) {
        conversationId = existingConv.id
    } else {
        const { data: newConv } = await supabase
            .from('conversations')
            .insert({ contact_chat_id: from, status: 'ai_active' })
            .select('id')
            .single()
        conversationId = newConv!.id
    }

    // ─── Insérer le message entrant ───────────────────────────────
    await supabase.from('messages').insert({
        conversation_id: conversationId,
        contact_chat_id: from,
        wasender_message_id: messageId,
        direction: 'inbound',
        message_type: messageType === 'conversation' || messageType === 'extendedTextMessage' ? 'text' : messageType as any,
        body: body || null,
        delivery_status: 'delivered',
        timestamp: new Date((msgObj?.messageTimestamp || Date.now() / 1000) * 1000).toISOString(),
    })

    // ─── Dispatch selon le type de message ───────────────────────
    const isTextMessage = messageType === 'conversation' || messageType === 'extendedTextMessage'
    const conversationStatus = existingConv?.status ?? 'ai_active'

    // Vérifier STOP / opt-out
    if (isTextMessage && body.trim().toUpperCase() === 'STOP') {
        await supabase
            .from('Profil_Prospects')
            .update({ opt_in: false })
            .eq('chat_id', from)
        await sendWhatsAppMessage(from,
            'Vous êtes désinscrit des communications BloLab. Envoyez START pour vous réinscrire.'
        )
        return NextResponse.json({ ok: true })
    }

    // Réinscription
    if (isTextMessage && body.trim().toUpperCase() === 'START') {
        await supabase
            .from('Profil_Prospects')
            .update({ opt_in: true })
            .eq('chat_id', from)
        await sendWhatsAppMessage(from, 'Bienvenue ! Vous êtes de retour. Comment puis-je vous aider ?')
        return NextResponse.json({ ok: true })
    }

    // Si conversation déjà prise en charge par un humain ou escaladée → ignorer l'IA
    if (conversationStatus === 'assigned' || conversationStatus === 'resolved' || conversationStatus === 'escalated') {
        return NextResponse.json({ ok: true })
    }

    // Message texte → pipeline IA avec waitUntil (Vercel reste actif)
    if (isTextMessage && body && conversationStatus === 'ai_active') {
        waitUntil(
            triggerAIResponse({ from, text: body, conversationId }).catch((err) =>
                console.error('[Webhook] Erreur pipeline IA:', err)
            )
        )
        return NextResponse.json({ ok: true })
    }

    // Message non-texte (audio, image, vidéo, doc) → escalade humaine
    if (!isTextMessage) {
        await sendWhatsAppMessage(from,
            `Je reçois votre message. Pour les fichiers et les audio, ` +
            `un conseiller BloLab prendra en charge votre demande très bientôt.`
        )
        await supabase
            .from('conversations')
            .update({ status: 'escalated' })
            .eq('id', conversationId)
        return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: true })
}

/** Met à jour le statut de livraison d'un message dans la BD */
async function handleDeliveryUpdate(data: any) {
    const supabase = createAdminClient()
    const updates = data?.messages ?? []

    for (const msg of updates) {
        const messageId = msg.key?.id
        const status =
            msg.update?.status === 3 ? 'delivered' :
                msg.update?.status === 4 ? 'read' :
                    msg.update?.status === 0 ? 'failed' : null

        if (messageId && status) {
            await supabase
                .from('messages')
                .update({ delivery_status: status })
                .eq('wasender_message_id', messageId)
        }
    }
}

/**
 * Gère les résultats de poll (event poll.results).
 * Identifie le choix du votant, l'injecte comme message texte dans la table messages,
 * puis déclenche le pipeline IA normalement pour qu'il traite la réponse.
 */
async function handlePollResult(data: any) {
    const supabase = createAdminClient()

    // Identifier le votant depuis les voters de chaque option
    const pollResult: Array<{ name: string; voters: string[] }> = data?.pollResult ?? []
    
    // Trouver les options choisies (voters non vides)
    const chosenOptions = pollResult
        .filter(opt => opt.voters && opt.voters.length > 0)
        .map(opt => opt.name)

    if (chosenOptions.length === 0) return // Pas de vote encore

    // Extraire le numéro du votant (ex: "229...@s.whatsapp.net")
    const firstVoterJid = pollResult.flatMap(o => o.voters)[0] ?? ''
    const from = firstVoterJid.replace('@s.whatsapp.net', '').replace('@lid', '')

    if (!from) return

    // Texte synthétique représentant le choix
    const voteText = chosenOptions.join(', ')

    console.log(`[Poll] Vote reçu de ${from}: ${voteText}`)

    // Trouver la conversation active
    const { data: existingConv } = await supabase
        .from('conversations')
        .select('id, status')
        .eq('contact_chat_id', from)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

    if (!existingConv || existingConv.status !== 'ai_active') return

    // Injecter le vote comme message inbound dans la table messages
    await supabase.from('messages').insert({
        conversation_id: existingConv.id,
        contact_chat_id: from,
        direction: 'inbound',
        message_type: 'text',
        body: voteText,
        delivery_status: 'delivered',
        timestamp: new Date().toISOString(),
    })

    // Déclencher le pipeline IA avec la réponse du poll
    await triggerAIResponse({ from, text: voteText, conversationId: existingConv.id })
}

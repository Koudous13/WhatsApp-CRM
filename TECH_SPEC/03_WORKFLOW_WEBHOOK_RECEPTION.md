# 03 — Workflow 1 : Réception & Traitement des Messages (Webhook)
## BloLab Dashboard CRM WhatsApp IA

---

## Vue d'ensemble

C'est le **point d'entrée de tout le système**. Chaque message WhatsApp reçu passe par ce workflow avant d'être dispatché vers l'IA, le pipeline vocal, ou une escalade humaine.

```
WaSenderAPI
    │  POST /api/webhooks/wasender
    ▼
[1] Validation HMAC-SHA256
    │
    ▼
[2] Parse & Formatage du Payload
    │
    ▼
[3] Vérifications de sécurité
    │   ├─ Blacklist ? → STOP silencieux
    │   ├─ Groupe sans mention ? → STOP
    │   └─ Message de moi-même (fromMe) ? → STOP
    │
    ▼
[4] Upsert Contact (CDP)
    │
    ▼
[5] Upsert Conversation
    │
    ▼
[6] Enregistrement du Message
    │
    ▼
[7] Dispatch selon le type
    │
    ├── TEXT → Workflow RAG (04)
    ├── AUDIO/PTT → Workflow STT (05)
    ├── IMAGE/VIDEO/DOC → Escalade humaine
    └── AUTRE → Message automatique + escalade
```

---

## Code Complet : `app/api/webhooks/wasender/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyHmacSignature } from '@/lib/wasender/hmac'
import { parseWasenderPayload } from '@/lib/wasender/parser'
import { triggerAIResponse } from '@/lib/ai/rag-pipeline'
import { triggerSTTPipeline } from '@/lib/ai/stt'
import { sendWhatsAppMessage } from '@/lib/wasender/client'
import { downloadAndStoreMedia } from '@/lib/wasender/media'

export async function POST(req: NextRequest) {
  // ─── [1] VALIDATION HMAC ─────────────────────────────────────────
  const rawBody = await req.text()
  const signature = req.headers.get('x-wasender-signature') ?? ''
  const secret = process.env.WASENDER_WEBHOOK_SECRET!

  if (!verifyHmacSignature(rawBody, signature, secret)) {
    console.warn('[Webhook] Signature HMAC invalide')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = JSON.parse(rawBody)

  // ─── [2] PARSE DU PAYLOAD ────────────────────────────────────────
  const parsed = parseWasenderPayload(body)

  // Ignorer les événements non-message (delivery receipts, etc.)
  if (!parsed || parsed.event !== 'messages.upsert') {
    return NextResponse.json({ ok: true })
  }

  const { from, fromMe, messageType, text, mediaInfo, messageId } = parsed

  // Ignorer les messages que nous avons envoyés
  if (fromMe) return NextResponse.json({ ok: true })

  const supabase = createClient()

  // ─── [3] VÉRIFICATIONS DE SÉCURITÉ ──────────────────────────────

  // Ignorer les messages de groupe (sauf mention @BloLabBot)
  if (from.endsWith('@g.us')) {
    const botMentioned = text?.includes('@BloLabBot') ||
                         text?.includes('@blolab')
    if (!botMentioned) return NextResponse.json({ ok: true })
  }

  // Vérifier blacklist
  const { data: contact } = await supabase
    .from('contacts')
    .select('id, is_blacklisted, statut_conversation, muted_until, opt_in')
    .eq('whatsapp_number', from)
    .single()

  if (contact?.is_blacklisted) {
    console.log(`[Webhook] Numéro blacklisté ignoré : ${from}`)
    return NextResponse.json({ ok: true })
  }

  // ─── [4] UPSERT CONTACT ──────────────────────────────────────────
  const { data: upsertedContact } = await supabase
    .from('contacts')
    .upsert(
      {
        whatsapp_number: from,
        last_contact_at: new Date().toISOString(),
        nombre_interactions: (contact?.nombre_interactions ?? 0) + 1,
      },
      { onConflict: 'whatsapp_number' }
    )
    .select('id, statut_conversation, muted_until')
    .single()

  const contactId = upsertedContact!.id

  // Premier contact : envoyer message de bienvenue + opt-in
  if (!contact) {
    await sendWhatsAppMessage(from,
      `Bonjour ! 👋 Je suis l'assistant virtuel de BloLab.\n\n` +
      `En continuant cette conversation, vous acceptez que vos données ` +
      `soient utilisées pour améliorer notre service.\n` +
      `Tapez *STOP* à tout moment pour vous désinscrire.`
    )
  }

  // Gérer STOP (opt-out)
  if (text?.trim().toUpperCase() === 'STOP') {
    await supabase
      .from('contacts')
      .update({ opt_in: false })
      .eq('id', contactId)

    await sendWhatsAppMessage(from,
      `Vous avez été désinscrit de nos communications. ` +
      `Tapez *START* pour vous réinscrire.`
    )
    return NextResponse.json({ ok: true })
  }

  // ─── [5] UPSERT CONVERSATION ─────────────────────────────────────
  const { data: conversation } = await supabase
    .from('conversations')
    .upsert(
      { contact_id: contactId },
      { onConflict: 'contact_id' }
    )
    .select('id, status, muted_until')
    .single()

  const conversationId = conversation!.id

  // ─── [6] ENREGISTREMENT DU MESSAGE ──────────────────────────────

  // Pour les médias : télécharger et stocker immédiatement (fenêtre 1h)
  let storedMediaUrl: string | null = null
  if (mediaInfo && messageType !== 'text') {
    storedMediaUrl = await downloadAndStoreMedia(mediaInfo, contactId)
  }

  await supabase.from('messages').insert({
    conversation_id: conversationId,
    contact_id: contactId,
    wasender_message_id: messageId,
    direction: 'inbound',
    message_type: messageType,
    body: text ?? null,
    media_url: storedMediaUrl,
    media_filename: mediaInfo?.fileName ?? null,
    media_mimetype: mediaInfo?.mimetype ?? null,
  })

  // ─── [7] DISPATCH ────────────────────────────────────────────────

  // Si l'IA est silencieuse (muted), on notifie l'admin et on s'arrête
  const isMuted = conversation?.status === 'muted_permanent' ||
    (conversation?.status === 'muted_temp' &&
     conversation?.muted_until &&
     new Date(conversation.muted_until) > new Date())

  if (isMuted) {
    // Pousser à l'inbox pour traitement humain uniquement
    return NextResponse.json({ ok: true })
  }

  // Dispatch selon le type
  switch (messageType) {
    case 'text':
      // Pipeline RAG — appel asynchrone (ne bloque pas la réponse webhook)
      triggerAIResponse({
        from,
        text: text!,
        contactId,
        conversationId,
      }).catch(console.error)
      break

    case 'audio':
      // Pipeline STT + évaluation confiance
      triggerSTTPipeline({
        from,
        mediaUrl: storedMediaUrl!,
        mediaInfo: mediaInfo!,
        contactId,
        conversationId,
      }).catch(console.error)
      break

    case 'image':
    case 'video':
    case 'document':
      // Escalade systématique vers humain
      await handleMediaEscalation(from, messageType, conversationId, supabase)
      break

    default:
      await sendWhatsAppMessage(from,
        `Nous avons reçu votre message. Un membre de notre équipe ` +
        `vous répondra très bientôt.`
      )
      await supabase
        .from('conversations')
        .update({ status: 'escalated' })
        .eq('id', conversationId)
  }

  return NextResponse.json({ ok: true })
}

async function handleMediaEscalation(
  from: string,
  type: string,
  conversationId: string,
  supabase: ReturnType<typeof createClient>
) {
  const messages: Record<string, string> = {
    image: `Nous avons bien reçu votre image. Un conseiller BloLab vous répondra bientôt.`,
    video: `Nous avons reçu votre vidéo. Un membre de l'équipe la visionnera et vous contactera.`,
    document: `Votre document a été reçu. Notre équipe vous reviendra rapidement.`,
  }

  await sendWhatsAppMessage(from, messages[type])
  await supabase
    .from('conversations')
    .update({ status: 'escalated' })
    .eq('id', conversationId)
}
```

---

## Utilitaires Nécessaires

### `lib/wasender/hmac.ts`

```typescript
import { createHmac } from 'crypto'

export function verifyHmacSignature(
  rawBody: string,
  signature: string,
  secret: string
): boolean {
  const expected = createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex')

  // Comparaison en temps constant (anti timing-attack)
  return `sha256=${expected}` === signature
}
```

### `lib/wasender/parser.ts`

```typescript
export interface ParsedMessage {
  event: string
  messageId: string
  from: string
  fromMe: boolean
  messageType: 'text' | 'audio' | 'image' | 'video' | 'document' | 'sticker' | 'contact' | 'location'
  text: string | null
  mediaInfo: {
    url: string
    mediaKey: string
    mimetype: string
    fileName?: string
    ptt?: boolean  // Push-to-talk = vocal
  } | null
}

export function parseWasenderPayload(body: any): ParsedMessage | null {
  try {
    const event = body.event
    const data = body.data?.messages
    if (!data) return null

    const message = data.message
    const from = data.key?.remoteJid ?? ''
    const fromMe = data.key?.fromMe ?? false
    const messageId = data.key?.id ?? ''

    let messageType: ParsedMessage['messageType'] = 'text'
    let text: string | null = null
    let mediaInfo: ParsedMessage['mediaInfo'] = null

    if (message.conversation || message.extendedTextMessage) {
      messageType = 'text'
      text = message.conversation ?? message.extendedTextMessage?.text
    } else if (message.audioMessage) {
      messageType = 'audio'
      mediaInfo = {
        url: message.audioMessage.url,
        mediaKey: message.audioMessage.mediaKey,
        mimetype: message.audioMessage.mimetype,
        ptt: message.audioMessage.ptt ?? false,
      }
    } else if (message.imageMessage) {
      messageType = 'image'
      text = message.imageMessage.caption ?? null
      mediaInfo = {
        url: message.imageMessage.url,
        mediaKey: message.imageMessage.mediaKey,
        mimetype: message.imageMessage.mimetype,
      }
    } else if (message.videoMessage) {
      messageType = 'video'
      mediaInfo = {
        url: message.videoMessage.url,
        mediaKey: message.videoMessage.mediaKey,
        mimetype: message.videoMessage.mimetype,
      }
    } else if (message.documentMessage) {
      messageType = 'document'
      mediaInfo = {
        url: message.documentMessage.url,
        mediaKey: message.documentMessage.mediaKey,
        mimetype: message.documentMessage.mimetype,
        fileName: message.documentMessage.fileName,
      }
    }

    return { event, messageId, from, fromMe, messageType, text, mediaInfo }
  } catch (err) {
    console.error('[Parser] Erreur parsing payload:', err)
    return null
  }
}
```

### `lib/wasender/media.ts`

```typescript
import { createClient } from '@/lib/supabase/server'

/**
 * Télécharge le média depuis WaSenderAPI et le stocke dans Supabase Storage.
 * IMPORTANT : WaSenderAPI expire les URLs média après 1 heure.
 * Ce téléchargement doit se faire dès la réception du webhook.
 */
export async function downloadAndStoreMedia(
  mediaInfo: { url: string; mediaKey: string; mimetype: string; fileName?: string },
  contactId: string
): Promise<string | null> {
  try {
    // Appel au endpoint de déchiffrement WaSenderAPI
    const decryptRes = await fetch(
      `https://api.wasenderapi.com/api/decrypt-media`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.WASENDER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: mediaInfo.url,
          mediaKey: mediaInfo.mediaKey,
          mimetype: mediaInfo.mimetype,
        }),
      }
    )

    if (!decryptRes.ok) throw new Error('Déchiffrement WaSenderAPI échoué')

    const fileBuffer = await decryptRes.arrayBuffer()
    const ext = mediaInfo.mimetype.split('/')[1] ?? 'bin'
    const fileName = mediaInfo.fileName ?? `${Date.now()}.${ext}`
    const storagePath = `contacts/${contactId}/${fileName}`

    const supabase = createClient()
    const { error } = await supabase.storage
      .from('whatsapp-media')
      .upload(storagePath, fileBuffer, {
        contentType: mediaInfo.mimetype,
        upsert: false,
      })

    if (error) throw error

    const { data: publicUrl } = supabase.storage
      .from('whatsapp-media')
      .getPublicUrl(storagePath)

    return publicUrl.publicUrl
  } catch (err) {
    console.error('[Media] Erreur stockage média:', err)
    return null
  }
}
```

### `lib/wasender/client.ts`

```typescript
const WASENDER_BASE = 'https://api.wasenderapi.com'

export async function sendWhatsAppMessage(
  to: string,
  text: string
): Promise<void> {
  const res = await fetch(`${WASENDER_BASE}/api/send-message`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.WASENDER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ to, text }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`[WaSender] Envoi échoué: ${err}`)
  }
}

export async function sendWhatsAppMedia(
  to: string,
  mediaType: 'image' | 'document' | 'audio',
  mediaUrl: string,
  caption?: string
): Promise<void> {
  const res = await fetch(`${WASENDER_BASE}/api/send-${mediaType}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.WASENDER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ to, url: mediaUrl, caption }),
  })

  if (!res.ok) throw new Error(`[WaSender] Envoi média échoué`)
}

export async function getSessionStatus(): Promise<{
  connected: boolean
  status: 'connected' | 'disconnected' | 'connecting'
}> {
  const res = await fetch(
    `${WASENDER_BASE}/api/sessions/${process.env.WASENDER_SESSION_ID}/status`,
    {
      headers: { 'Authorization': `Bearer ${process.env.WASENDER_API_KEY}` },
    }
  )
  return res.json()
}
```

---

## Gestion des Webhooks de Livraison (delivery receipts)

WaSenderAPI envoie aussi des webhooks pour les statuts de livraison. On les traite dans le même endpoint :

```typescript
// Dans la route.ts, avant le dispatch, ajouter ce bloc :
if (body.event === 'messages.update') {
  const updates = body.data?.messages ?? []
  for (const update of updates) {
    const deliveryStatus = update.update?.status  // 'delivered' | 'read'
    const wasenderId = update.key?.id

    if (deliveryStatus && wasenderId) {
      await supabase
        .from('messages')
        .update({ delivery_status: deliveryStatus })
        .eq('wasender_message_id', wasenderId)
    }
  }
  return NextResponse.json({ ok: true })
}
```

---

*Section 03 complète — Prochaine étape : `04_WORKFLOW_RAG_IA.md`*

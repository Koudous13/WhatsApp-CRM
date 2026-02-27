# 07 — Workflow 5 : Broadcast & Campagnes WhatsApp
## BloLab Dashboard CRM WhatsApp IA

---

## Vue d'ensemble

Le module Broadcast permet d'envoyer des messages ciblés à des segments de la base de contacts (CDP). Il gère la planification, l'envoi en rafale avec rate limiting, le tracking (delivered/read) et la gestion RGPD des opt-outs.

```
Admin crée une campagne (dashboard)
    │
    ▼
[1] Sélection audience via filtres CDP
    │   (tags, opt_in, programme_recommande, langue…)
    │
    ▼
[2] Éditeur de message + prévisualisation
    │   (formatage WhatsApp: *gras*, _italique_, médias)
    │
    ▼
[3] Planification : immédiat ou date/heure future
    │
    ▼
[4] Création de la campagne en base (broadcasts + broadcast_recipients)
    │
    ▼
[5] Envoi (immédiat ou via Cron Vercel pour le scheduling)
    │   └── Rate limiting : 1 message / 1 seconde (WaSenderAPI)
    │
    ▼
[6] Webhooks WaSenderAPI → mise à jour delivered/read
    │
    ▼
[7] Rapport post-campagne en temps réel
```

---

## Route API — Création de Campagne : `app/api/broadcast/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyAdminAuth } from '@/lib/auth/middleware'

// GET — Liste des campagnes
export async function GET(req: NextRequest) {
  const auth = await verifyAdminAuth(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient()
  const { data } = await supabase
    .from('broadcasts')
    .select('*')
    .order('created_at', { ascending: false })

  return NextResponse.json(data)
}

// POST — Créer une campagne
export async function POST(req: NextRequest) {
  const auth = await verifyAdminAuth(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, body, mediaUrl, audienceFilters, scheduledAt } = await req.json()

  const supabase = createClient()

  // Résoudre l'audience avec les filtres CDP
  const recipients = await resolveAudience(audienceFilters, supabase)

  if (recipients.length === 0) {
    return NextResponse.json(
      { error: 'Aucun contact ne correspond aux filtres sélectionnés' },
      { status: 400 }
    )
  }

  // Créer la campagne
  const { data: campaign } = await supabase
    .from('broadcasts')
    .insert({
      created_by: auth.userId,
      name,
      body,
      media_url: mediaUrl ?? null,
      audience_filters: audienceFilters,
      total_recipients: recipients.length,
      scheduled_at: scheduledAt ?? null,
      status: scheduledAt ? 'scheduled' : 'draft',
    })
    .select('id')
    .single()

  const campaignId = campaign!.id

  // Créer les lignes destinataires
  const recipientRows = recipients.map((contactId: string) => ({
    broadcast_id: campaignId,
    contact_id: contactId,
    status: 'pending',
  }))

  await supabase.from('broadcast_recipients').insert(recipientRows)

  // Si envoi immédiat, lancer sans attendre
  if (!scheduledAt) {
    sendBroadcast(campaignId, supabase).catch(console.error)
  }

  return NextResponse.json({
    ok: true,
    campaignId,
    totalRecipients: recipients.length,
  })
}

/**
 * Résout l'audience en appliquant les filtres CDP sur la table contacts.
 */
async function resolveAudience(
  filters: Record<string, any>,
  supabase: any
): Promise<string[]> {
  let query = supabase
    .from('contacts')
    .select('id')
    .eq('opt_in', true)         // TOUJOURS filtrer les non opt-in
    .eq('is_blacklisted', false)

  // Filtre par tags
  if (filters.tags && filters.tags.length > 0) {
    query = query.contains('tags', filters.tags)
  }

  // Filtre par programme recommandé
  if (filters.programme_recommande) {
    query = query.eq('programme_recommande', filters.programme_recommande)
  }

  // Filtre par statut de lead
  if (filters.statut_lead) {
    query = query.eq('statut_lead', filters.statut_lead)
  }

  // Filtre par langue vernaculaire
  if (filters.langue_vernaculaire !== undefined) {
    query = query.eq('langue_vernaculaire', filters.langue_vernaculaire)
  }

  // Filtre date premier contact (ex: contacts depuis moins de 30 jours)
  if (filters.since) {
    query = query.gte('first_contact_at', filters.since)
  }

  const { data } = await query
  return (data ?? []).map((c: any) => c.id)
}
```

---

## Envoi en Rafale : `lib/broadcast/sender.ts`

```typescript
import { createClient } from '@/lib/supabase/server'
import { sendWhatsAppMessage, sendWhatsAppMedia } from '@/lib/wasender/client'

const RATE_LIMIT_MS = 1200  // 1 message toutes les 1.2 secondes

/**
 * Envoie la campagne à tous les destinataires avec rate limiting.
 * Met à jour le statut de chaque envoi en base en temps réel.
 */
export async function sendBroadcast(
  campaignId: string,
  supabase: ReturnType<typeof createClient>
): Promise<void> {
  // Marquer la campagne comme "en cours"
  await supabase
    .from('broadcasts')
    .update({ status: 'running', sent_at: new Date().toISOString() })
    .eq('id', campaignId)

  // Récupérer la campagne et les destinataires en attente
  const { data: campaign } = await supabase
    .from('broadcasts')
    .select('body, media_url')
    .eq('id', campaignId)
    .single()

  const { data: recipients } = await supabase
    .from('broadcast_recipients')
    .select('id, contact_id, contacts(whatsapp_number)')
    .eq('broadcast_id', campaignId)
    .eq('status', 'pending')

  let sentCount = 0
  let failedCount = 0

  for (const recipient of recipients ?? []) {
    const phone = (recipient as any).contacts?.whatsapp_number
    if (!phone) continue

    try {
      // Ajouter mention opt-out dans chaque message
      const messageBody = campaign!.body +
        '\n\n_Répondez STOP pour ne plus recevoir nos communications._'

      if (campaign?.media_url) {
        await sendWhatsAppMedia(phone, 'image', campaign.media_url, messageBody)
      } else {
        await sendWhatsAppMessage(phone, messageBody)
      }

      // Marquer comme envoyé
      await supabase
        .from('broadcast_recipients')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', recipient.id)

      sentCount++
    } catch (err) {
      console.error(`[Broadcast] Échec envoi ${phone}:`, err)
      await supabase
        .from('broadcast_recipients')
        .update({ status: 'failed' })
        .eq('id', recipient.id)
      failedCount++
    }

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS))
  }

  // Clôturer la campagne
  await supabase
    .from('broadcasts')
    .update({
      status: 'completed',
      sent_count: sentCount,
      failed_count: failedCount,
    })
    .eq('id', campaignId)
}
```

---

## Route Envoi Manuel : `app/api/broadcast/[id]/send/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyAdminAuth } from '@/lib/auth/middleware'
import { sendBroadcast } from '@/lib/broadcast/sender'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await verifyAdminAuth(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient()

  // Vérifier que la campagne appartient à l'organisation
  const { data: campaign } = await supabase
    .from('broadcasts')
    .select('id, status')
    .eq('id', params.id)
    .single()

  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (campaign.status === 'running' || campaign.status === 'completed') {
    return NextResponse.json({ error: 'Campagne déjà lancée' }, { status: 400 })
  }

  // Lancer l'envoi en arrière-plan
  sendBroadcast(params.id, supabase).catch(console.error)

  return NextResponse.json({ ok: true })
}
```

---

## Cron pour les Campagnes Planifiées : `app/api/cron/broadcast/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendBroadcast } from '@/lib/broadcast/sender'

// Exécuté toutes les 5 minutes par Vercel Cron
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient()
  const now = new Date().toISOString()

  // Trouver toutes les campagnes planifiées dont l'heure est passée
  const { data: dueCampaigns } = await supabase
    .from('broadcasts')
    .select('id')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)

  for (const campaign of dueCampaigns ?? []) {
    sendBroadcast(campaign.id, supabase).catch(console.error)
  }

  return NextResponse.json({ launched: dueCampaigns?.length ?? 0 })
}
```

---

## Tracking Delivered/Read via Webhook

Les webhooks WaSenderAPI mettent à jour les statuts de livraison en temps réel. Dans le webhook principal (`03_WORKFLOW_WEBHOOK_RECEPTION.md`), on ajoute ce bloc :

```typescript
// Dans app/api/webhooks/wasender/route.ts
// Gestion des delivery receipts pour les broadcasts

if (body.event === 'messages.update') {
  const updates = body.data?.messages ?? []

  for (const update of updates) {
    const wasenderId = update.key?.id
    const deliveryStatus = update.update?.status  // 'delivered' | 'read'
    if (!wasenderId || !deliveryStatus) continue

    // Mettre à jour le message
    await supabase
      .from('messages')
      .update({ delivery_status: deliveryStatus })
      .eq('wasender_message_id', wasenderId)

    // Mettre à jour le destinataire broadcast si applicable
    const { data: recipient } = await supabase
      .from('broadcast_recipients')
      .select('id, broadcast_id')
      .eq('wasender_msg_id', wasenderId)
      .single()

    if (recipient) {
      await supabase
        .from('broadcast_recipients')
        .update({ status: deliveryStatus })
        .eq('id', recipient.id)

      // Incrémenter les compteurs sur la campagne
      const field = deliveryStatus === 'read' ? 'read_count' : 'delivered_count'
      await supabase.rpc('increment_broadcast_count', {
        campaign_id: recipient.broadcast_id,
        field_name: field,
      })
    }
  }

  return NextResponse.json({ ok: true })
}
```

```sql
-- Fonction SQL pour incrémenter les compteurs
CREATE OR REPLACE FUNCTION increment_broadcast_count(
  campaign_id UUID,
  field_name TEXT
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format(
    'UPDATE broadcasts SET %I = %I + 1 WHERE id = $1',
    field_name, field_name
  ) USING campaign_id;
END;
$$;
```

---

## Gestion Opt-Out (STOP)

L'opt-out est détecté dans `03_WORKFLOW_WEBHOOK_RECEPTION.md`. En complément, on log también les désinscriptions liées aux broadcasts :

```typescript
// Dans le handler STOP du webhook principal
if (text?.trim().toUpperCase() === 'STOP') {
  await supabase
    .from('contacts')
    .update({ opt_in: false })
    .eq('id', contactId)

  // Incrémenter le compteur opt-out sur le dernier broadcast reçu
  const { data: lastBroadcastRecipient } = await supabase
    .from('broadcast_recipients')
    .select('broadcast_id')
    .eq('contact_id', contactId)
    .order('sent_at', { ascending: false })
    .limit(1)
    .single()

  if (lastBroadcastRecipient) {
    await supabase.rpc('increment_broadcast_count', {
      campaign_id: lastBroadcastRecipient.broadcast_id,
      field_name: 'optout_count',
    })
  }
}
```

---

## Groupes WhatsApp

```typescript
// lib/wasender/groups.ts
export async function getWhatsAppGroups(): Promise<Group[]> {
  const res = await fetch(
    `https://api.wasenderapi.com/api/groups`,
    { headers: { 'Authorization': `Bearer ${process.env.WASENDER_API_KEY}` } }
  )
  return res.json()
}

export async function sendGroupMessage(
  groupId: string,
  text: string
): Promise<void> {
  await fetch(`https://api.wasenderapi.com/api/send-message`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.WASENDER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ to: groupId, text }),
  })
}
```

**Règle IA dans les groupes :** L'IA est en **mode Read-Only** dans les groupes. Elle ne répond que si `@BloLabBot` est mentionné dans le message (géré dans le webhook dispatcher — `Workflow 03`).

---

*Section 07 complète — Prochaine étape : `08_WORKFLOW_MONITORING_SESSION.md`*

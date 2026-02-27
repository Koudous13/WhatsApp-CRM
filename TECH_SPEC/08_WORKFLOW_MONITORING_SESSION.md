# 08 — Workflow 6 : Monitoring de Session WhatsApp
## BloLab Dashboard CRM WhatsApp IA

---

## Vue d'ensemble

Ce workflow surveille en continu l'état de la connexion WhatsApp (session WaSenderAPI). Une session peut se déconnecter si le téléphone est éteint, si WhatsApp est réinstallé, ou après une longue période d'inactivité.

```
Cron Vercel toutes les 5 minutes
    │
    ▼
[1] GET /api/sessions/{sessionId}/status → WaSenderAPI
    │
    ├── connected → Mise à jour badge vert dans dashboard
    │
    ├── disconnected → Badge rouge + Alerte email admin
    │   └── Notification Telegram équipe
    │
    └── connecting → Badge orange (reconnexion en cours)
    │
    ▼
[2] Storage du statut dans Supabase (table session_status)
    │
    ▼
[3] Push Supabase Realtime → badge mis à jour instantanément
```

---

## Table SQL `session_status`

```sql
CREATE TABLE session_status (
  id          SERIAL PRIMARY KEY,
  status      TEXT NOT NULL,          -- 'connected' | 'disconnected' | 'connecting'
  checked_at  TIMESTAMPTZ DEFAULT NOW(),
  session_id  TEXT NOT NULL
);

-- Conserver seulement les 100 derniers checks (historique léger)
CREATE OR REPLACE FUNCTION trim_session_status()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM session_status
  WHERE id NOT IN (
    SELECT id FROM session_status ORDER BY checked_at DESC LIMIT 100
  );
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_trim_session
  AFTER INSERT ON session_status
  FOR EACH STATEMENT EXECUTE FUNCTION trim_session_status();

-- Realtime sur cette table
ALTER PUBLICATION supabase_realtime ADD TABLE session_status;
```

---

## Cron de Monitoring : `app/api/cron/session-check/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionStatus } from '@/lib/wasender/client'
import { sendEmailAlert } from '@/lib/notifications/email'
import { sendTelegramAlert } from '@/lib/notifications/telegram'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient()
  const sessionId = process.env.WASENDER_SESSION_ID!

  let status = 'disconnected'

  try {
    const result = await getSessionStatus()
    status = result.status  // 'connected' | 'disconnected' | 'connecting'
  } catch {
    status = 'disconnected'
  }

  // Stocker le résultat (déclenche Realtime → badge dashboard)
  await supabase.from('session_status').insert({ status, session_id: sessionId })

  // Si déconnecté, alerter l'équipe
  if (status === 'disconnected') {
    // Vérifier qu'on n'a pas déjà alerté dans les 30 dernières minutes
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const { data: recentAlert } = await supabase
      .from('session_status')
      .select('id')
      .eq('status', 'disconnected')
      .gte('checked_at', thirtyMinutesAgo)
      .limit(2)

    // Alerter seulement si c'est la première détection de déconnexion
    if (!recentAlert || recentAlert.length <= 1) {
      await Promise.all([
        sendEmailAlert({
          subject: '🔴 BloLab CRM — Session WhatsApp déconnectée',
          html: `
            <h2>⚠️ Session WhatsApp déconnectée</h2>
            <p>La session WhatsApp BloLab s'est déconnectée à ${new Date().toLocaleString('fr-FR')}.</p>
            <p>Connectez-vous au dashboard pour re-scanner le QR Code :</p>
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/settings/whatsapp">
              Reconnexion Dashboard
            </a>
          `,
        }),
        sendTelegramAlert(
          `🔴 *Session WhatsApp DÉCONNECTÉE*\n` +
          `Heure: ${new Date().toLocaleString('fr-FR')}\n` +
          `→ Reconnectez-vous sur le dashboard CRM`
        ),
      ])
    }
  }

  return NextResponse.json({ ok: true, status })
}
```

---

## Route API — Statut Courant : `app/api/session/status/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyAdminAuth } from '@/lib/auth/middleware'
import { getSessionStatus } from '@/lib/wasender/client'

// GET — Statut actuel (utilisé au chargement du dashboard)
export async function GET(req: NextRequest) {
  const auth = await verifyAdminAuth(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Lire le dernier statut stocké (plus rapide que d'appeler WaSenderAPI)
  const supabase = createClient()
  const { data } = await supabase
    .from('session_status')
    .select('status, checked_at')
    .order('checked_at', { ascending: false })
    .limit(1)
    .single()

  return NextResponse.json({
    status: data?.status ?? 'unknown',
    lastChecked: data?.checked_at,
  })
}

// POST — Forcer un re-check immédiat
export async function POST(req: NextRequest) {
  const auth = await verifyAdminAuth(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await getSessionStatus()
  const supabase = createClient()
  await supabase.from('session_status').insert({
    status: result.status,
    session_id: process.env.WASENDER_SESSION_ID,
  })

  return NextResponse.json(result)
}
```

---

## Hook React — Badge Temps Réel : `hooks/useSessionStatus.ts`

```typescript
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type SessionStatus = 'connected' | 'disconnected' | 'connecting' | 'unknown'

export function useSessionStatus() {
  const [status, setStatus] = useState<SessionStatus>('unknown')
  const [lastChecked, setLastChecked] = useState<Date | null>(null)

  useEffect(() => {
    // Charger le statut initial
    fetch('/api/session/status')
      .then(r => r.json())
      .then(data => {
        setStatus(data.status)
        setLastChecked(new Date(data.lastChecked))
      })

    // Écouter les mises à jour Realtime
    const supabase = createClient()
    const channel = supabase
      .channel('session-status')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'session_status' },
        (payload) => {
          setStatus(payload.new.status as SessionStatus)
          setLastChecked(new Date(payload.new.checked_at))
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  return { status, lastChecked }
}
```

---

## Composant Badge : `components/dashboard/SessionBadge.tsx`

```typescript
import { useSessionStatus } from '@/hooks/useSessionStatus'

export function SessionBadge() {
  const { status, lastChecked } = useSessionStatus()

  const config = {
    connected:    { color: 'bg-green-500',  label: 'WhatsApp connecté',       dot: '●' },
    connecting:   { color: 'bg-amber-400',  label: 'Reconnexion en cours…',   dot: '◌' },
    disconnected: { color: 'bg-red-500',    label: 'Session déconnectée !',    dot: '●' },
    unknown:      { color: 'bg-gray-400',   label: 'Statut inconnu',           dot: '○' },
  }[status]

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100 text-sm">
      <span className={`text-xs ${config.color.replace('bg-', 'text-')}`}>
        {config.dot}
      </span>
      <span className="font-medium">{config.label}</span>
      {lastChecked && (
        <span className="text-xs text-gray-400">
          {lastChecked.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
      {status === 'disconnected' && (
        <a
          href="/settings/whatsapp"
          className="ml-1 text-xs text-red-600 underline font-semibold"
        >
          Reconnecter →
        </a>
      )}
    </div>
  )
}
```

---

## Page de Reconnexion QR : `app/(dashboard)/settings/whatsapp/page.tsx`

```typescript
'use client'
import { useState } from 'react'

export default function WhatsAppSettingsPage() {
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function generateQR() {
    setLoading(true)
    // WaSenderAPI fournit un endpoint pour générer le QR de reconnexion
    const res = await fetch(
      `https://api.wasenderapi.com/api/sessions/${process.env.NEXT_PUBLIC_SESSION_ID}/qr`,
      { headers: { 'Authorization': `Bearer ${process.env.NEXT_PUBLIC_WASENDER_KEY}` } }
    )
    const data = await res.json()
    setQrCode(data.qrCode)  // base64 image
    setLoading(false)
  }

  return (
    <div className="max-w-lg mx-auto p-8">
      <h1 className="text-2xl font-bold mb-2">Connexion WhatsApp</h1>
      <p className="text-gray-500 mb-6">
        Scannez ce QR Code avec l'application WhatsApp du numéro BloLab
        pour reconnecter la session.
      </p>

      <button
        onClick={generateQR}
        disabled={loading}
        className="px-4 py-2 bg-green-600 text-white rounded-lg mb-6"
      >
        {loading ? 'Génération...' : 'Générer le QR Code'}
      </button>

      {qrCode && (
        <div className="border rounded-xl p-4 bg-white inline-block">
          <img
            src={`data:image/png;base64,${qrCode}`}
            alt="QR Code WhatsApp"
            className="w-64 h-64"
          />
          <p className="text-xs text-center text-gray-400 mt-2">
            Ce QR Code expire dans 60 secondes
          </p>
        </div>
      )}
    </div>
  )
}
```

---

## Notifications Email : `lib/notifications/email.ts`

```typescript
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendEmailAlert({
  subject,
  html,
}: {
  subject: string
  html: string
}): Promise<void> {
  await resend.emails.send({
    from: 'CRM BloLab <noreply@blolab.bj>',
    to: ['tech@blolab.bj'],   // Configurable en env var
    subject,
    html,
  })
}
```

---

*Section 08 complète — Prochaine étape : `09_AI_AGENT_PROMPT_PROFILAGE.md`*

# 12 — Variables d'Environnement & Configuration
## BloLab Dashboard CRM WhatsApp IA

---

## Fichier `.env.example` (à copier en `.env.local`)

```env
# ════════════════════════════════════════════════════
# SUPABASE
# ════════════════════════════════════════════════════
# URL publique du projet Supabase
NEXT_PUBLIC_SUPABASE_URL=https://VOTRE_ID.supabase.co

# Clé anonyme (lecture publique — safe côté client)
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...

# Clé service role (accès complet — JAMAIS côté client)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# ════════════════════════════════════════════════════
# WASENDERAPI
# ════════════════════════════════════════════════════
# Clé API Bearer (dans votre dashboard WaSenderAPI)
WASENDER_API_KEY=wsa_live_XXXXXXXXXXXXXXXXXXXX

# ID de la session (numéro WhatsApp BloLab)
WASENDER_SESSION_ID=blolab_cotonou

# Secret HMAC pour valider les webhooks entrants (min. 32 caractères)
WASENDER_WEBHOOK_SECRET=un_secret_aleatoire_de_minimum_32_caracteres

# ════════════════════════════════════════════════════
# LLM — GOOGLE GEMINI (Principal)
# ════════════════════════════════════════════════════
# Clé API Google AI Studio ou Google Cloud
# Utilisée pour : Gemini 2.0 Flash (LLM) + gemini-embedding-001
GOOGLE_GENERATIVE_AI_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXX

# ════════════════════════════════════════════════════
# LLM — OPENAI (Fallback si Gemini KO)
# ════════════════════════════════════════════════════
OPENAI_API_KEY=sk-proj-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# ════════════════════════════════════════════════════
# STT — GROQ (Transcription vocaux via Whisper large-v3)
# ════════════════════════════════════════════════════
GROQ_API_KEY=gsk_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# ════════════════════════════════════════════════════
# NOTIFICATIONS EMAIL — RESEND
# ════════════════════════════════════════════════════
RESEND_API_KEY=re_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# Email destinataire des alertes système
ALERT_EMAIL_TO=tech@blolab.bj

# ════════════════════════════════════════════════════
# NOTIFICATIONS — TELEGRAM
# ════════════════════════════════════════════════════
# Token du bot Telegram (créé via @BotFather)
TELEGRAM_BOT_TOKEN=7XXXXXXXXXX:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ID du groupe Telegram de l'équipe BloLab (commence par -100...)
TELEGRAM_ALERT_CHAT_ID=-1001234567890

# ════════════════════════════════════════════════════
# APPLICATION
# ════════════════════════════════════════════════════
# URL publique de l'application (sans slash final)
NEXT_PUBLIC_APP_URL=https://crm.blolab.bj

# Secret partagé pour authentifier les appels Cron Vercel
CRON_SECRET=un_autre_secret_aleatoire_tres_fort

# ════════════════════════════════════════════════════
# STT AVANCE — SEUILS DE CONFIANCE (optionnels)
# ════════════════════════════════════════════════════
# Score au-dessus duquel l'IA répond automatiquement (défaut: 0.80)
STT_HIGH_CONFIDENCE_THRESHOLD=0.80

# Score au-dessus duquel la transcription est affichée (défaut: 0.50)
STT_MEDIUM_CONFIDENCE_THRESHOLD=0.50

# ════════════════════════════════════════════════════
# RAG — SEUILS DE SIMILARITÉ (optionnels)
# ════════════════════════════════════════════════════
# Score de similarité minimum pour les chunks pgvector (défaut: 0.75)
RAG_SIMILARITY_THRESHOLD=0.75

# Nombre de chunks retournés par la recherche vectorielle (défaut: 5)
RAG_MATCH_COUNT=5

# ════════════════════════════════════════════════════
# SLA — DÉLAIS D'ESCALADE (optionnels)
# ════════════════════════════════════════════════════
# Minutes avant alerte si une escalade reste sans réponse humaine
SLA_ESCALATION_ALERT_MINUTES=30
```

---

## `vercel.json` — Configuration Vercel

```json
{
  "crons": [
    {
      "path": "/api/cron/scrape",
      "schedule": "0 3 * * 1"
    },
    {
      "path": "/api/cron/session-check",
      "schedule": "*/5 * * * *"
    },
    {
      "path": "/api/cron/broadcast",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

> **Explication des schedules (cron POSIX) :**
> - `0 3 * * 1` → Chaque lundi à 3h du matin (WAT) — scraping hebdomadaire
> - `*/5 * * * *` → Toutes les 5 minutes — monitoring session + broadcasts planifiés

---

## `next.config.mjs`

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: '10mb' },  // Pour l'upload de fichiers PDF
  },
  images: {
    remotePatterns: [
      { hostname: '*.supabase.co' },           // Images depuis Supabase Storage
    ],
  },
  // Headers de sécurité
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin' },
        ],
      },
    ]
  },
}

export default nextConfig
```

---

## `middleware.ts` — Protection du Dashboard

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()

  // Ne protéger que les routes du dashboard
  if (!req.nextUrl.pathname.startsWith('/(dashboard)') &&
      !req.nextUrl.pathname.startsWith('/inbox') &&
      !req.nextUrl.pathname.startsWith('/contacts') &&
      !req.nextUrl.pathname.startsWith('/ai-agent') &&
      !req.nextUrl.pathname.startsWith('/broadcast') &&
      !req.nextUrl.pathname.startsWith('/analytics') &&
      !req.nextUrl.pathname.startsWith('/settings')) {
    return res
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => req.cookies.getAll(), setAll: () => {} } }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return res
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|login).*)'],
}
```

---

## `lib/supabase/server.ts`

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createClient() {
  const cookieStore = cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,  // Service role = bypass RLS
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
}
```

## `lib/supabase/client.ts`

```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!  // Anon key = soumis à RLS
  )
}
```

---

## Configuration du Stockage Supabase (Storage)

```sql
-- Créer le bucket pour les médias WhatsApp
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('whatsapp-media', 'whatsapp-media', false, 52428800);  -- 50 MB max

-- Policy : seul le service role peut lire/écrire (utilisé côté serveur)
CREATE POLICY "Service role full access"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'whatsapp-media');

-- Policy : les admins authentifiés peuvent lire
CREATE POLICY "Authenticated admins read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'whatsapp-media' AND
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE id = auth.uid() AND is_active = TRUE
    )
  );
```

---

*Section 12 complète — Prochaine étape : `13_GUIDE_DEPLOIEMENT.md`*

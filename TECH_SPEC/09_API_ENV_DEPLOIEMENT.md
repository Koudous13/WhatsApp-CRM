# 09 — Routes API Complètes, Variables d'Environnement & Guide de Déploiement
## BloLab Dashboard CRM WhatsApp IA

> Ce fichier regroupe les sections 10, 12 et 13 du plan de travail pour aller à l'essentiel.

---

## PARTIE A — Référentiel de Toutes les Routes API

### Auth Middleware : `lib/auth/middleware.ts`

```typescript
import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function verifyAdminAuth(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  const { data: admin } = await supabase
    .from('admin_users')
    .select('id, role, is_active')
    .eq('id', user.id)
    .single()

  if (!admin?.is_active) return null

  return { userId: user.id, role: admin.role }
}
```

### Tableau des Routes API

| Méthode | Route | Auth | Description |
|---------|-------|------|-------------|
| `POST` | `/api/webhooks/wasender` | HMAC | Réception messages WhatsApp |
| `POST` | `/api/ai/respond` | Admin | Déclencher réponse IA manuellement |
| `POST` | `/api/ai/transcribe` | Admin | Déclencher transcription STT |
| `GET/POST` | `/api/knowledge/chunks` | Admin | CRUD chunks manuels |
| `DELETE` | `/api/knowledge/chunks` | Admin | Désactiver un chunk |
| `POST` | `/api/knowledge/scrape` | Admin | Déclencher scraping |
| `POST` | `/api/knowledge/search` | Admin | Playground RAG (test) |
| `POST` | `/api/knowledge/rollback` | Admin | Rollback vers une version |
| `GET` | `/api/contacts` | Admin | Liste contacts avec filtres |
| `POST` | `/api/contacts` | Admin | Créer contact |
| `GET/PATCH` | `/api/contacts/[id]` | Admin | Fiche + mise à jour contact |
| `GET` | `/api/conversations` | Admin | Liste conversations |
| `GET/PATCH` | `/api/conversations/[id]` | Admin | Détail + maj statut |
| `POST` | `/api/conversations/[id]/takeover` | Admin | Reprendre la main |
| `POST` | `/api/conversations/[id]/mute` | Admin | Silencer l'IA |
| `GET/POST` | `/api/broadcast` | Admin | Liste + créer campagne |
| `POST` | `/api/broadcast/[id]/send` | Admin | Lancer une campagne |
| `GET` | `/api/session/status` | Admin | Statut connexion WhatsApp |
| `POST` | `/api/session/status` | Admin | Forcer re-check |
| `GET` | `/api/analytics` | Admin | Données analytiques |
| `GET` | `/api/cron/scrape` | Cron secret | Scraping hebdomadaire |
| `GET` | `/api/cron/session-check` | Cron secret | Check session 5min |
| `GET` | `/api/cron/broadcast` | Cron secret | Broadcasts planifiés |

---

### Route Takeover : `app/api/conversations/[id]/takeover/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyAdminAuth } from '@/lib/auth/middleware'
import { sendWhatsAppMessage } from '@/lib/wasender/client'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await verifyAdminAuth(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sendTransitionMessage } = await req.json()
  const supabase = createClient()

  // Récupérer le contact (pour envoyer le message de transition)
  const { data: conv } = await supabase
    .from('conversations')
    .select('contact_id, contacts(whatsapp_number)')
    .eq('id', params.id)
    .single()

  // Mettre l'IA en pause + assigner à l'admin
  await supabase
    .from('conversations')
    .update({
      status: 'assigned',
      assigned_to: auth.userId,
    })
    .eq('id', params.id)

  // Log du changement
  await supabase.from('conversation_assignments_log').insert({
    conversation_id: params.id,
    changed_by: auth.userId,
    new_status: 'assigned',
    new_assigned_to: auth.userId,
    note: `Prise en main par l'administrateur`,
  })

  // Message de transition vers le contact (optionnel)
  if (sendTransitionMessage) {
    const phone = (conv as any)?.contacts?.whatsapp_number
    if (phone) {
      await sendWhatsAppMessage(phone,
        `Je transmets votre demande à l'équipe BloLab. ` +
        `Vous serez pris en charge sous peu.`
      )
    }
  }

  return NextResponse.json({ ok: true })
}
```

### Route Analytique : `app/api/analytics/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyAdminAuth } from '@/lib/auth/middleware'

export async function GET(req: NextRequest) {
  const auth = await verifyAdminAuth(req)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const since = searchParams.get('since') ??
    new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()

  const supabase = createClient()

  const [
    { count: totalMessages },
    { count: inboundMessages },
    { count: aiResponses },
    { count: escalations },
    { count: newContacts },
    { data: vocalStats },
    { data: topTopics },
  ] = await Promise.all([
    supabase.from('messages').select('*', { count: 'exact', head: true }).gte('created_at', since),
    supabase.from('messages').select('*', { count: 'exact', head: true }).eq('direction', 'inbound').gte('created_at', since),
    supabase.from('messages').select('*', { count: 'exact', head: true }).eq('is_ai_response', true).gte('created_at', since),
    supabase.from('ai_logs').select('*', { count: 'exact', head: true }).eq('was_escalated', true).gte('created_at', since),
    supabase.from('contacts').select('*', { count: 'exact', head: true }).gte('first_contact_at', since),
    supabase.from('messages').select('transcript_status').eq('message_type', 'audio').gte('created_at', since),
    supabase.from('contacts').select('centre_interet').not('centre_interet', 'is', null).gte('first_contact_at', since),
  ])

  // Calcul taux vocal
  const totalVocals = (vocalStats ?? []).length
  const highConfidenceVocals = (vocalStats ?? []).filter(m => m.transcript_status === 'high').length

  return NextResponse.json({
    period: { since },
    messages: { total: totalMessages, inbound: inboundMessages, outbound: (totalMessages ?? 0) - (inboundMessages ?? 0) },
    ai: {
      responses: aiResponses,
      escalations,
      resolutionRate: aiResponses && totalMessages ? Math.round((aiResponses / inboundMessages!) * 100) : 0,
      escalationRate: escalations && inboundMessages ? Math.round((escalations / inboundMessages) * 100) : 0,
    },
    contacts: { new: newContacts },
    vocal: {
      total: totalVocals,
      highConfidence: highConfidenceVocals,
      successRate: totalVocals > 0 ? Math.round((highConfidenceVocals / totalVocals) * 100) : 0,
    },
  })
}
```

---

## PARTIE B — Variables d'Environnement Complètes

### `.env.local` (développement) / Variables Vercel (production)

```env
# ─── SUPABASE ────────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1...   # ⚠️ JAMAIS exposé côté client

# ─── WASENDERAPI ─────────────────────────────────────────────────
WASENDER_API_KEY=wsa_live_xxxxxxxxxxxx
WASENDER_SESSION_ID=session_blolab_cotonou
WASENDER_WEBHOOK_SECRET=un_secret_fort_aleatoire_min32chars

# ─── LLM ─────────────────────────────────────────────────────────
GOOGLE_GENERATIVE_AI_API_KEY=AIzaSy...          # Gemini 2.0 Flash + Embeddings
OPENAI_API_KEY=sk-proj-...                       # Fallback GPT-4o-mini

# ─── STT ─────────────────────────────────────────────────────────
GROQ_API_KEY=gsk_xxxxxxxxxxxx                    # Whisper large-v3 via Groq

# ─── NOTIFICATIONS ───────────────────────────────────────────────
RESEND_API_KEY=re_xxxxxxxxxxxx
ALERT_EMAIL_TO=tech@blolab.bj
TELEGRAM_BOT_TOKEN=7xxxxxxxxx:AAHxxxxxxxxxxxx
TELEGRAM_ALERT_CHAT_ID=-100xxxxxxxxxx           # ID du groupe Telegram de l'équipe

# ─── APP ─────────────────────────────────────────────────────────
NEXT_PUBLIC_APP_URL=https://crm.blolab.bj       # URL de production
CRON_SECRET=un_secret_fort_pour_les_crons       # Vérifié dans tous les endpoints cron
```

---

## PARTIE C — Guide de Déploiement Step-by-Step

### Étape 1 — Prérequis

- [ ] Compte Supabase créé (region EU recommandée)
- [ ] Compte WaSenderAPI + session créée (numéro WhatsApp BloLab scanné)
- [ ] Compte Google Cloud avec API Generative AI activée
- [ ] Compte Groq (gratuit — Whisper large-v3)
- [ ] Compte Resend (emails — plan gratuit suffisant)
- [ ] Bot Telegram créé via @BotFather
- [ ] Compte Vercel

---

### Étape 2 — Base de Données Supabase

```bash
# 1. Dans le SQL Editor Supabase, exécuter dans l'ordre :
#    → 02_BASE_DE_DONNEES.md (toutes les requêtes SQL)

# 2. Activer Realtime sur les tables (Supabase Dashboard > Database > Replication)
#    → messages, conversations, contacts, session_status

# 3. Créer le bucket Storage
#    → Nom: "whatsapp-media"
#    → Public: false (accès contrôlé via service_role)
#    → Taille max fichier: 50MB

# 4. Configurer l'Auth
#    → Désactiver "Enable email confirmations" (admin uniquement)
#    → Ajouter le domaine de production aux "Redirect URLs"
```

---

### Étape 3 — Cloner et configurer le projet

```bash
# Cloner le repo
git clone https://github.com/blolab/crm-whatsapp.git
cd crm-whatsapp

# Installer les dépendances
pnpm install

# Copier et remplir les variables d'environnement
cp .env.example .env.local
# → Éditer .env.local avec toutes les clés

# Tester en local
pnpm dev
```

---

### Étape 4 — Configurer le Webhook WaSenderAPI

```bash
# Dans le dashboard WaSenderAPI :
# 1. Aller dans Session > Settings > Webhook
# 2. URL Webhook: https://crm.blolab.bj/api/webhooks/wasender
# 3. Secret: même valeur que WASENDER_WEBHOOK_SECRET
# 4. Events à activer:
#    ✅ messages.upsert (messages entrants)
#    ✅ messages.update (delivery receipts)
#    ✅ connection.update (statut session)
```

---

### Étape 5 — Déploiement Vercel

```bash
# Installer Vercel CLI
npm i -g vercel

# Déployer
vercel --prod

# Configurer les variables d'environnement sur Vercel
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
# ... (toutes les variables de .env.local)

# Vérifier que vercel.json est présent avec les crons :
cat vercel.json
# {
#   "crons": [
#     { "path": "/api/cron/scrape",          "schedule": "0 3 * * 1" },
#     { "path": "/api/cron/session-check",   "schedule": "*/5 * * * *" },
#     { "path": "/api/cron/broadcast",       "schedule": "*/5 * * * *" }
#   ]
# }
```

---

### Étape 6 — Premier Lancement

```bash
# 1. Créer le premier administrateur
#    → Supabase Dashboard > Auth > Users > Invite user
#    → Email: admin@blolab.bj

# 2. Insérer le profil admin en SQL :
INSERT INTO admin_users (id, full_name, email, role)
VALUES (
  '<uuid-de-l-utilisateur-supabase-auth>',
  'Médard Agbayazon',
  'admin@blolab.bj',
  'super_admin'
);

# 3. Déclencher le premier scraping depuis le dashboard
#    → AI Agent > Base de connaissances > "Actualiser"

# 4. Tester avec un message WhatsApp depuis un numéro de test
```

---

### Étape 7 — Environnement Staging

```bash
# Créer un projet Vercel séparé pour le staging
vercel --prod --scope=blolab-staging

# Utiliser :
# - Un numéro WhatsApp secondaire (dédié aux tests)
# - Une base Supabase séparée (projet Supabase "BloLab CRM Staging")
# - Les mêmes clés API LLM/STT (pas de distinction nécessaire)
# - URL: https://crm-staging.blolab.bj
```

---

### Checklist de Validation Finale

```
WEBHOOKS
[ ] Envoyer un message texte depuis un numéro externe → Réponse IA reçue
[ ] Envoyer un vocal → Transcription + réponse ou escalade
[ ] Envoyer "STOP" → opt_in = false + message de confirmation
[ ] Envoyer depuis un groupe sans mention → Ignoré silencieusement

IA & RAG
[ ] Question sur une formation → Réponse factuelle correcte
[ ] Question hors périmètre → Escalade + message "je reviens vers toi"
[ ] Mot-clé "humain" → Escalade immédiate
[ ] Playground dashboard → Chunks retournés cohérents

BROADCAST
[ ] Créer campagne → Filtrer audience → Preview → Envoyer
[ ] Répondre STOP → opt-out enregistré + compteur campagne incrémenté

MONITORING
[ ] Badge vert visible dans le dashboard
[ ] Déconnecter session → Badge rouge dans < 6 minutes + email reçu

ANALYTICS
[ ] Graphiques remplis après 24h de données
```

---

*Section 09 (API Routes + Env + Déploiement) complète — Toutes les sections sont terminées !*

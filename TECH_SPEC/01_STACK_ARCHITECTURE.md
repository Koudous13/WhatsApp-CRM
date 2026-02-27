# 01 — Stack Technologique & Architecture Globale
## BloLab Dashboard CRM WhatsApp IA

---

## 1. Vue d'ensemble

Le système est une **plateforme fullstack Next.js** qui centralise toutes les communications WhatsApp de BloLab, augmentée d'un agent IA capable de répondre automatiquement, profiler les prospects, gérer des campagnes et exposer un dashboard temps réel à l'équipe.

**Zéro n8n.** Tout est du code natif TypeScript.

---

## 2. Schéma d'Architecture Globale

```
┌─────────────────────────────────────────────────────────────────┐
│                        UTILISATEURS WHATSAPP                     │
│              (Béninois — Français, Fon, Yoruba, etc.)            │
└────────────────────────────┬────────────────────────────────────┘
                             │ Messages (texte, audio, image, doc…)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                        WaSenderAPI.com                           │
│          (Session WhatsApp persistante + REST + Webhooks)        │
└──────────┬────────────────────────────────────┬─────────────────┘
           │ POST Webhook (HMAC validé)          │ POST /api/send-message
           ▼                                     │
┌──────────────────────────────────────┐         │
│        NEXT.JS APPLICATION           │◄────────┘
│   (Vercel — App Router + API Routes) │
│                                      │
│  ┌─────────────────────────────────┐ │
│  │     API Routes (Edge / Node)    │ │
│  │  /api/webhooks/wasender         │ │  ← Réception messages
│  │  /api/ai/respond                │ │  ← Pipeline RAG
│  │  /api/ai/transcribe             │ │  ← Pipeline Vocal STT
│  │  /api/knowledge/scrape          │ │  ← Scraping + Embeddings
│  │  /api/broadcast/send            │ │  ← Envoi campagnes
│  │  /api/contacts/*                │ │  ← CDP CRUD
│  │  /api/conversations/*           │ │  ← Inbox CRUD
│  │  /api/session/status            │ │  ← Monitoring WhatsApp
│  └──────────────┬──────────────────┘ │
│                 │                    │
│  ┌──────────────▼──────────────────┐ │
│  │        DASHBOARD UI             │ │
│  │   (React + Tailwind + Radix)    │ │
│  │  - Inbox (3 colonnes)           │ │
│  │  - Chat window                  │ │
│  │  - Contacts (CDP)               │ │
│  │  - AI Agent settings            │ │
│  │  - Broadcast                    │ │
│  │  - Analytics                    │ │
│  └─────────────────────────────────┘ │
└──────────────────┬───────────────────┘
                   │
       ┌───────────┼───────────────┐
       ▼           ▼               ▼
┌────────────┐ ┌────────────┐ ┌──────────────────┐
│  SUPABASE  │ │    LLM     │ │  SERVICES TIERS   │
│            │ │            │ │                   │
│ PostgreSQL │ │ Gemini 2.0 │ │ Groq/Whisper STT  │
│ pgvector   │ │ Flash      │ │ Google Chirp STT  │
│ Realtime   │ │   (ou)     │ │ Telegram Bot API  │
│ Storage    │ │ GPT-4o-mini│ │ Resend (emails)   │
│ Auth (JWT) │ │            │ │                   │
│ pgvector   │ │ Embeddings │ │                   │
│            │ │ Gemini-001 │ │                   │
└────────────┘ └────────────┘ └──────────────────┘
```

---

## 3. Stack Technologique Détaillée

| Couche | Technologie | Version | Rôle |
|--------|-------------|---------|------|
| **Framework** | Next.js (App Router) | 16.x | SSR + API Routes + Cron Jobs |
| **Langage** | TypeScript | 5.7 | Typage strict partout |
| **UI** | Tailwind CSS + Radix UI + shadcn/ui | 4.x | Dashboard admin |
| **Graphiques** | Recharts | 2.x | Analytics |
| **Base de données** | Supabase (PostgreSQL 16) | Cloud | Données, contacts, messages |
| **Vecteurs** | pgvector (extension Supabase) | 0.8 | RAG — stockage embeddings |
| **Temps réel** | Supabase Realtime | — | Push messages → dashboard |
| **Stockage fichiers** | Supabase Storage | — | Audios, images, documents WhatsApp |
| **Auth** | Supabase Auth (JWT) | — | Connexion admins |
| **WhatsApp** | WaSenderAPI REST | v1 | Envoi/réception messages |
| **LLM principal** | Google Gemini 2.0 Flash | — | Réponses IA + profilage |
| **LLM fallback** | GPT-4o-mini (OpenAI) | — | Secours si Gemini KO |
| **Embeddings** | `gemini-embedding-001` | — | Vectorisation textes |
| **STT Vocal** | Groq → Whisper large-v3 | — | Transcription (principal) |
| **STT Fallback** | Gemini Audio / Google Chirp | — | Support langues africaines |
| **Emails** | Resend | — | Alertes session, notifications |
| **Cron Jobs** | Vercel Cron | — | Scraping hebdo, monitoring session |
| **Jobs async** | Vercel Edge Functions | — | Traitements longs (broadcast) |
| **Hébergement** | Vercel | — | App Next.js |
| **Cache/Queue** | Upstash Redis (optionnel) | — | File d'attente broadcast |

---

## 4. Structure du Projet Next.js

```
blolab-crm/
├── app/
│   ├── layout.tsx                    # Layout racine
│   ├── globals.css
│   ├── (auth)/
│   │   └── login/page.tsx            # Page de connexion admin
│   ├── (dashboard)/
│   │   ├── layout.tsx                # Sidebar + header communs
│   │   ├── page.tsx                  # Dashboard home (stats résumées)
│   │   ├── inbox/page.tsx            # Inbox conversations
│   │   ├── contacts/
│   │   │   ├── page.tsx              # Liste contacts
│   │   │   └── [id]/page.tsx         # Fiche contact
│   │   ├── ai-agent/page.tsx         # Config agent IA + playground
│   │   ├── broadcast/page.tsx        # Campagnes
│   │   └── analytics/page.tsx        # Statistiques
│   └── api/
│       ├── webhooks/
│       │   └── wasender/route.ts     # Endpoint webhook principal
│       ├── ai/
│       │   ├── respond/route.ts      # Pipeline RAG → réponse IA
│       │   └── transcribe/route.ts   # Pipeline STT vocal
│       ├── knowledge/
│       │   ├── scrape/route.ts       # Déclenche scraping
│       │   ├── chunks/route.ts       # CRUD chunks manuels
│       │   └── search/route.ts       # Playground de test RAG
│       ├── contacts/
│       │   ├── route.ts              # GET list / POST create
│       │   └── [id]/route.ts         # GET / PATCH / DELETE
│       ├── conversations/
│       │   ├── route.ts              # GET list
│       │   ├── [id]/route.ts         # GET detail / PATCH status
│       │   └── [id]/takeover/route.ts # Prise en main humaine
│       ├── broadcast/
│       │   ├── route.ts              # GET campaigns / POST create
│       │   └── [id]/send/route.ts    # Déclenche envoi
│       ├── session/
│       │   └── status/route.ts       # Vérifie état session WaSenderAPI
│       └── cron/
│           ├── scrape/route.ts       # Cron Vercel → scraping hebdo
│           └── session-check/route.ts # Cron Vercel → monitoring 5min
│
├── components/
│   ├── inbox/
│   │   ├── ConversationList.tsx
│   │   ├── ChatWindow.tsx
│   │   ├── ContactPanel.tsx
│   │   └── AudioPlayer.tsx
│   ├── contacts/
│   │   ├── ContactTable.tsx
│   │   └── ContactCard.tsx
│   ├── ai-agent/
│   │   ├── KnowledgeEditor.tsx
│   │   └── RAGPlayground.tsx
│   ├── broadcast/
│   │   ├── CampaignEditor.tsx
│   │   └── CampaignReport.tsx
│   ├── analytics/
│   │   └── DashboardCharts.tsx
│   └── ui/                           # shadcn/ui components
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts                 # Client Supabase côté client
│   │   └── server.ts                 # Client Supabase côté serveur
│   ├── wasender/
│   │   └── client.ts                 # Client WaSenderAPI (envoi, groupes)
│   ├── ai/
│   │   ├── rag-pipeline.ts           # Pipeline RAG complet
│   │   ├── embeddings.ts             # Gemini embeddings
│   │   ├── stt/
│   │   │   ├── index.ts              # Interface abstraite STT
│   │   │   ├── groq.ts               # Provider Groq/Whisper
│   │   │   └── gemini-audio.ts       # Provider Gemini Audio
│   │   └── lead-profiler.ts          # Extraction silencieuse données prospect
│   ├── scraper/
│   │   └── blolab-scraper.ts         # Scraper blolab.bj (Cheerio)
│   └── utils.ts
│
├── hooks/
│   ├── useRealtimeMessages.ts        # Supabase Realtime → inbox
│   └── useSessionStatus.ts          # Polling status WhatsApp
│
├── types/
│   └── index.ts                      # Types TypeScript globaux
│
├── middleware.ts                     # Auth middleware JWT
├── next.config.mjs
├── vercel.json                       # Cron jobs config
└── .env.local
```

---

## 5. Variables d'environnement (aperçu)

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# WaSenderAPI
WASENDER_API_KEY=
WASENDER_SESSION_ID=
WASENDER_WEBHOOK_SECRET=

# LLM
GOOGLE_GENERATIVE_AI_API_KEY=
OPENAI_API_KEY=

# STT
GROQ_API_KEY=

# Notifications
RESEND_API_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_ALERT_CHAT_ID=

# App
NEXT_PUBLIC_APP_URL=https://crm.blolab.bj
CRON_SECRET=
```

---

## 6. Flux de Données — Résumé des Workflows

| # | Workflow | Déclencheur | Traitement | Sortie |
|---|----------|-------------|------------|--------|
| W1 | **Réception message** | POST Webhook WaSenderAPI | Parse + vérifie + stocke | Dispatch vers W2, W3 ou escalade |
| W2 | **Réponse IA (RAG)** | Message texte → W1 | Embedding → pgvector → LLM → profil | Réponse WhatsApp + log |
| W3 | **Vocal (STT)** | Message audio → W1 | Déchiffre → STT → confidence → RAG | Réponse ou escalade admin |
| W4 | **Scraping KB** | Cron hebdo / Manuel | Scrape blolab.bj → chunks → embeddings | pgvector mis à jour |
| W5 | **Broadcast** | Planifié / Manuel | Segmentation CDP → envoi en rafale | Rapport delivered/read |
| W6 | **Monitoring session** | Cron 5 min | GET WaSenderAPI status | Badge dashboard + alerte email |

---

*Section 01 complète — Prochaine étape : `02_BASE_DE_DONNEES.md`*

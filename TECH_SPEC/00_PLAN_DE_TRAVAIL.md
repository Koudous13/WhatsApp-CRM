# 📋 PLAN DE TRAVAIL — Spécification Technique BloLab CRM WhatsApp IA
> Objectif : Produire un document technique complet de A à Z, sans n8n, tout en code.
> Chaque section sera un fichier .md séparé puis fusionné dans `SPEC_TECHNIQUE_COMPLÈTE.md`

---

## ✅ PROGRESSION

- [ ] **01 — Stack & Architecture Globale**
  - Schéma d'architecture général (Frontend → API → DB → WhatsApp → AI)
  - Stack technologique détaillée avec justification
  - Structure des dossiers du projet Next.js

- [ ] **02 — Base de Données (Supabase / PostgreSQL)**
  - Schéma SQL complet de toutes les tables :
    - `contacts` (CDP - anciennement "Profil Prospects")
    - `conversations`
    - `messages`
    - `knowledge_base` (pgvector)
    - `broadcasts` + `broadcast_recipients`
    - `admin_users`
    - `ai_logs`
    - `scraping_jobs`
  - Setup pgvector (extension + table + index)
  - Row Level Security (RLS) policies

- [ ] **03 — Workflow 1 : Réception & Traitement des Messages (Webhook)**
  - Endpoint POST `/api/webhooks/wasender`
  - Validation HMAC-SHA256
  - Parse du payload WaSenderAPI
  - Détection du type : texte / audio / image / vidéo / document
  - Vérifications : blacklist ? muted ? groupe sans mention ?
  - Enregistrement en base (contact + message)
  - Dispatch vers le bon sous-workflow

- [ ] **04 — Workflow 2 : Pipeline RAG — Réponse IA (Messages Texte)**
  - Embedding du message → recherche pgvector
  - Construction du prompt System + Historique + Contexte + Message
  - Appel LLM (Gemini Flash / GPT-4o-mini)
  - Profilage silencieux : extraction données → update `contacts`
  - Score lead (1–10) → alerte Telegram si ≥ 8
  - Envoi réponse via WaSenderAPI
  - Log asynchrone (ai_logs)
  - Push Supabase Realtime → dashboard

- [ ] **05 — Workflow 3 : Pipeline Vocal (STT + Confidence Scoring)**
  - Déchiffrement + téléchargement immédiat du fichier audio (fenêtre 1h)
  - Upload Supabase Storage
  - Envoi au modèle STT (Whisper via Groq / Google Chirp / Gemini Audio)
  - Interface abstraite STT (swappable provider)
  - Cas A (score > 0.80) → RAG normal
  - Cas B (score 0.50–0.80) → alert admin + message d'attente
  - Cas C (score < 0.50 ou échec) → statut "Vocal non transcrit" + escalade
  - Tag `langue_vernaculaire` si langue ≠ français

- [ ] **06 — Workflow 4 : Scraping & Mise à Jour de la Base de Connaissances**
  - Scraper Next.js (Cheerio/JSDOM) pour blolab.bj
  - Pages cibles configurables
  - Chunking (paragraphes + overlap)
  - Génération embeddings (Google Gemini Embedding / OpenAI)
  - Upsert dans Supabase pgvector (`knowledge_base`)
  - Versioning + rollback
  - Déclenchement : manuel (dashboard) + cron hebdomadaire (Vercel Cron)
  - Alertes en cas d'échec (email)

- [ ] **07 — Workflow 5 : Broadcast & Campagnes**
  - Création campagne + sélection audience (filtres CDP)
  - Scheduling (Vercel Cron / BullMQ via Upstash Redis)
  - Envoi en rafale avec rate limiting WaSenderAPI
  - Tracking : delivered / read via webhooks WaSenderAPI
  - Gestion opt-out (STOP) → `opt_in = false`
  - Rapport post-campagne

- [ ] **08 — Workflow 6 : Monitoring de Session WhatsApp**
  - Cron toutes les 5 minutes → GET WaSenderAPI session status
  - Mise à jour badge dans dashboard via Supabase Realtime
  - Alerte email si session déconnectée
  - Page de reconnexion QR dans le dashboard

- [ ] **09 — Module AI Agent : Prompt Système & Logique de Profilage**
  - System prompt complet (rôle, règles, framework CLOSING en 5 étapes)
  - Extraction silencieuse des données prospect
  - Gestion mémoire de conversation (PostgreSQL chat history)
  - Seuils d'escalade configurables
  - Mode silencieux / takeover humain

- [ ] **10 — APIs & Routes Next.js (Référentiel complet)**
  - Toutes les routes API documentées
  - Auth middleware (JWT Supabase)
  - Rate limiting
  - Structure des payloads (Request/Response)

- [ ] **11 — Frontend : Pages & Composants**
  - Inbox (3 colonnes, Realtime, statuts conversations)
  - Chat window (messages, audio player, prise de contrôle)
  - Contacts / CDP (liste, fiche, recherche sémantique, import/export)
  - AI Agent (base de connaissances, playground, seuils, blacklist)
  - Broadcast (éditeur, scheduling, rapports)
  - Analytics (graphiques Recharts)
  - Monitoring WhatsApp (badge de session)

- [ ] **12 — Variables d'Environnement & Configuration**
  - Fichier `.env.example` complet
  - Setup Supabase (auth, RLS, pgvector)
  - Configuration WaSenderAPI
  - Configuration Vercel (domaine, crons, env vars)

- [ ] **13 — Guide de Déploiement (Staging → Production)**
  - Ordre d'installation
  - Commandes step-by-step
  - Tests de validation

---

## 📁 FICHIERS QUI SERONT PRODUITS

```
TECH_SPEC/
├── 00_PLAN_DE_TRAVAIL.md          ← CE FICHIER
├── 01_STACK_ARCHITECTURE.md
├── 02_BASE_DE_DONNEES.md
├── 03_WORKFLOW_WEBHOOK_RECEPTION.md
├── 04_WORKFLOW_RAG_IA.md
├── 05_WORKFLOW_VOCAL_STT.md
├── 06_WORKFLOW_SCRAPING_RAG.md
├── 07_WORKFLOW_BROADCAST.md
├── 08_WORKFLOW_MONITORING_SESSION.md
├── 09_AI_AGENT_PROMPT_PROFILAGE.md
├── 10_API_ROUTES_REFERENCE.md
├── 11_FRONTEND_PAGES_COMPOSANTS.md
├── 12_ENV_CONFIGURATION.md
├── 13_GUIDE_DEPLOIEMENT.md
└── SPEC_TECHNIQUE_COMPLETE.md     ← FUSION FINALE
```

---

*BloLab — Document de planification technique — Février 2026*

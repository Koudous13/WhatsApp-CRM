# SPEC_TECHNIQUE_COMPLETE — BloLab Dashboard CRM WhatsApp IA
### Document Technique Complet · Version 1.0 · Février 2026

> **Zéro n8n. Tout en code TypeScript natif.**
> Stack : Next.js 16 + Supabase + WaSenderAPI + Gemini 2.0 Flash + Groq/Whisper + Vercel

---

## Table des Matières

| # | Document | Contenu |
|---|----------|---------|
| 01 | [Stack & Architecture](./01_STACK_ARCHITECTURE.md) | Schéma global, stack, structure projet, variables d'env |
| 02 | [Base de Données](./02_BASE_DE_DONNEES.md) | 9 tables SQL, pgvector, triggers, RLS, Realtime |
| 03 | [Webhook Réception](./03_WORKFLOW_WEBHOOK_RECEPTION.md) | HMAC, parser, dispatch, media download |
| 04 | [Pipeline RAG IA](./04_WORKFLOW_RAG_IA.md) | Embedding, pgvector, LLM, profilage silencieux, Telegram |
| 05 | [Pipeline Vocal STT](./05_WORKFLOW_VOCAL_STT.md) | Groq/Whisper, Gemini Audio, 3 cas confiance |
| 06 | [Scraping KB](./06_WORKFLOW_SCRAPING_RAG.md) | Scraper Cheerio, chunking, embeddings, rollback |
| 07 | [Broadcast](./07_WORKFLOW_BROADCAST.md) | Campagnes, scheduling, rate limiting, opt-out |
| 08 | [Monitoring Session](./08_WORKFLOW_MONITORING_SESSION.md) | Cron 5min, badge Realtime, alertes, QR reconnexion |
| 09 | [API + Env + Déploiement](./09_API_ENV_DEPLOIEMENT.md) | Routes API, .env complet, guide step-by-step |
| 11 | [Frontend](./11_FRONTEND_PAGES_COMPOSANTS.md) | Pages, composants, hooks Realtime, analytics |

---

## Résumé des 6 Workflows Background

```
W1 — Réception Webhook        → Parse + sécurité + dispatch
W2 — Pipeline RAG             → Embedding → pgvector → LLM → profil → réponse
W3 — Pipeline STT Vocal       → Groq/Whisper → confidence → RAG ou escalade
W4 — Scraping KB              → Cheerio → chunks → Gemini Embeddings → pgvector
W5 — Broadcast                → CDP filter → rate-limited send → tracking
W6 — Monitoring Session       → Cron 5min → badge Realtime → alertes
```

---

## Schéma des Tables

```
contacts ──────────────────────────── clé centrale du CDP
    │                                  whatsapp_number (PK)
    ├── conversations                  1 conversation ouverte par contact
    │       └── messages              tous les échanges (texte/audio/image)
    │               └── ai_logs       trace de chaque décision IA
    ├── broadcast_recipients           appartenance aux campagnes
    └── admin_users (assigned_to)      assignation à un admin

broadcasts ───────────────────────── campagnes WhatsApp
    └── broadcast_recipients          destinataires + statuts livraison

knowledge_base (pgvector) ────────── base de connaissances RAG
    VECTOR(768) — gemini-embedding-001

scraping_jobs ────────────────────── historique des scraping
session_status ───────────────────── monitoring connexion WhatsApp
conversation_assignments_log ─────── audit trail des transferts
```

---

## Checklist de Démarrage Rapide

```bash
# 1. Cloner et installer
git clone <repo> && cd crm-whatsapp && pnpm install

# 2. Copier les variables
cp .env.example .env.local
# → Remplir toutes les clés (Supabase, WaSenderAPI, Gemini, Groq, Resend, Telegram)

# 3. Initialiser la base de données
# → Exécuter 02_BASE_DE_DONNEES.md dans le SQL Editor Supabase

# 4. Lancer en local
pnpm dev

# 5. Configurer le webhook WaSenderAPI
# → URL: http://localhost:3000/api/webhooks/wasender (via ngrok pour les tests)

# 6. Déclencher le premier scraping
# → Dashboard > AI Agent > "Actualiser blolab.bj"

# 7. Déployer sur Vercel
vercel --prod
```

---

## Sécurité — Points Critiques

| Risque | Mesure |
|--------|--------|
| Webhook frauduleux | Validation HMAC-SHA256 obligatoire |
| Accès non autorisé au dashboard | JWT Supabase Auth + middleware Next.js |
| Exposition des clés API | Variables serveur uniquement (jamais `NEXT_PUBLIC_` pour les secrets) |
| Spam/flood | Rate limiting WaSenderAPI + vérification blacklist |
| RGPD | Opt-in explicite premier contact + STOP → opt_in=false |
| Accès inter-admins | RLS Supabase + rôles (super_admin / admin / agent / readonly) |

---

## Coûts Estimés (charge modérée — 500 contacts actifs/mois)

| Service | Usage estimé | Coût/mois |
|---------|-------------|-----------|
| Supabase Pro | PostgreSQL + Realtime + Storage | ~$25 |
| Vercel Pro | Hosting + Crons | ~$20 |
| WaSenderAPI | 1 session | ~$10-30 |
| Gemini API | ~50k messages/mois | ~$5 |
| Groq | Whisper — ~200 vocaux/mois | Gratuit |
| Resend | ~100 emails/mois | Gratuit |
| **Total** | | **~$60-80/mois** |

---

*BloLab — Zogbohouê, Cotonou · Parakou, Bénin*
*contact@blolab.bj · blolab.bj*
*Document technique v1.0 — Février 2026*

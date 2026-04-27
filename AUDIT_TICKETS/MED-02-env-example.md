# MED-02 — Créer `app/.env.example`

**Sévérité** : Moyenne
**Effort** : S (15 min)

## Contexte

Aucun `.env.example` n'existe. Un repreneur n'a aucun moyen de savoir quelles variables sont nécessaires sans lire tous les `process.env.*` du code.

## Variables détectées dans le code

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# WaSenderAPI (WhatsApp)
WASENDER_API_KEY=...
WASENDER_SESSION_ID=...
WASENDER_WEBHOOK_SECRET=...

# LLM - DeepSeek (principal pour le pipeline RAG)
DEEPSEEK_API_KEY=sk-...

# LLM - Google Gemini (utilisé pour les embeddings)
GOOGLE_GENERATIVE_AI_API_KEY=...

# LLM - OpenAI (dépendance installée mais pas utilisée — voir HIGH-06)
OPENAI_API_KEY=

# STT - Groq (prévu par la spec mais absent du code — voir HIGH-07)
GROQ_API_KEY=

# Emails - Resend (prévu par la spec, pas encore utilisé)
RESEND_API_KEY=

# Telegram - alertes lead chaud + handover
TELEGRAM_BOT_TOKEN=...
TELEGRAM_ALERT_CHAT_ID=...

# Cron Vercel (sécurise /api/broadcast/tick et futurs crons)
CRON_SECRET=...

# App
NEXT_PUBLIC_APP_URL=https://crm.blolab.bj

# Upstash Redis (pour rate limiting - voir HIGH-12)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

## Étapes

1. Créer `app/.env.example` avec le contenu ci-dessus, **sans valeurs réelles**.
2. Pour chaque variable, ajouter un commentaire court : où la récupérer, si elle est requise ou optionnelle.
3. Vérifier qu'elle est bien dans `.gitignore` (`.env*` — OK dans `app/.gitignore:34`).
4. S'assurer que le `.env.example` est committé (par défaut il ne le serait pas vu `.env*` — cf. MED-06 pour ajuster).

## Critères d'acceptation

- `app/.env.example` committé.
- Liste complète et à jour.
- Documentation inline pour chaque variable.

## Dépendances

- MED-06 (fix gitignore) pour permettre le commit de `.env.example`.

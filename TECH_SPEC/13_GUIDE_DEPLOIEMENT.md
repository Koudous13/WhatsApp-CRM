# 13 — Guide de Déploiement Complet (Staging → Production)
## BloLab Dashboard CRM WhatsApp IA

---

## Prérequis — Comptes à Créer

| Service | Lien | Plan recommandé | Coût/mois |
|---------|------|-----------------|-----------|
| **Supabase** | supabase.com | Pro (region EU) | ~$25 |
| **Vercel** | vercel.com | Pro | ~$20 |
| **WaSenderAPI** | wasenderapi.com | Starter | ~$15-30 |
| **Google AI Studio** | aistudio.google.com | Pay-as-you-go | ~$5 |
| **Groq** | console.groq.com | Gratuit | $0 |
| **Resend** | resend.com | Free (3k emails/mois) | $0 |
| **Telegram** | t.me/BotFather | Gratuit | $0 |

---

## PHASE 1 — Configuration des Services Tiers

### 1.1 Supabase — Créer le projet

```bash
# 1. Aller sur supabase.com > New Project
#    - Nom : "BloLab CRM Production"
#    - Region : EU West (Frankfurt) — conformité RGPD
#    - Mot de passe DB : sauvegarder dans un gestionnaire de mots de passe

# 2. Récupérer les clés dans Project Settings > API :
#    - Project URL       → NEXT_PUBLIC_SUPABASE_URL
#    - anon public       → NEXT_PUBLIC_SUPABASE_ANON_KEY
#    - service_role      → SUPABASE_SERVICE_ROLE_KEY  ⚠️ secret absolu
```

### 1.2 Supabase — Initialiser la base de données

Dans **SQL Editor** de Supabase, exécuter dans cet ordre exact :

```sql
-- ÉTAPE 1 : Extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ÉTAPE 2 : Types ENUM (copier depuis 02_BASE_DE_DONNEES.md)
-- ÉTAPE 3 : Tables (copier depuis 02_BASE_DE_DONNEES.md)
-- ÉTAPE 4 : Triggers (copier depuis 02_BASE_DE_DONNEES.md)
-- ÉTAPE 5 : RLS Policies (copier depuis 02_BASE_DE_DONNEES.md)
-- ÉTAPE 6 : Fonction de recherche vectorielle
-- ÉTAPE 7 : Publication Realtime

-- VÉRIFICATION : Toutes les tables doivent apparaître dans
-- Database > Tables : contacts, conversations, messages,
-- knowledge_base, ai_logs, admin_users, scraping_jobs,
-- broadcasts, broadcast_recipients, session_status,
-- conversation_assignments_log
```

### 1.3 Supabase — Configurer le Storage

```bash
# Dans Supabase Dashboard > Storage > New Bucket
#   - Name: whatsapp-media
#   - Public bucket: NON (privé)
#   - File size limit: 50 MB
# 
# Puis exécuter les policies SQL du fichier 12_ENV_CONFIGURATION.md
```

### 1.4 Supabase — Configurer l'Auth

```bash
# Dans Authentication > Settings :
#   - Enable email confirmations : DÉSACTIVER (admin only)
#   - Site URL : https://crm.blolab.bj
#   - Redirect URLs : https://crm.blolab.bj/auth/callback
#
# Dans Authentication > Email Templates :
#   - Personnaliser avec le branding BloLab
```

### 1.5 WaSenderAPI — Créer la session

```bash
# 1. S'inscrire sur wasenderapi.com
# 2. Créer une nouvelle session :
#    - Nom: "BloLab Cotonou Principal"
#    - Scanner le QR Code avec le téléphone BloLab
#    - Sauvegarder : Session ID et API Key

# 3. Configurer le Webhook (Settings > Webhook) :
#    URL: https://crm.blolab.bj/api/webhooks/wasender
#    Secret: générer avec : openssl rand -hex 32
#    Events à activer :
#      ✅ messages.upsert
#      ✅ messages.update
#      ✅ connection.update
```

### 1.6 Google AI Studio — Clé API

```bash
# 1. Aller sur aistudio.google.com
# 2. Get API Key > Create API Key
# 3. Choisir le projet Google Cloud (ou en créer un)
# 4. Copier la clé → GOOGLE_GENERATIVE_AI_API_KEY
# 5. Dans Google Cloud Console, activer :
#    - Generative Language API
#    - (Optionnel : Google Cloud Speech-to-Text API pour Chirp)
```

### 1.7 Telegram — Créer le bot d'alertes

```bash
# 1. Ouvrir Telegram > Rechercher @BotFather
# 2. /newbot
#    - Nom : BloLab CRM Alerts
#    - Username: blolab_crm_alerts_bot
# 3. Copier le token → TELEGRAM_BOT_TOKEN

# 4. Créer un groupe Telegram pour l'équipe BloLab tech
# 5. Ajouter le bot au groupe
# 6. Envoyer un message dans le groupe, puis :
curl "https://api.telegram.org/bot<TOKEN>/getUpdates"
#    Repérer "chat":{"id":-100XXXXXXXXXX} → TELEGRAM_ALERT_CHAT_ID
```

### 1.8 Resend — Email alerts

```bash
# 1. S'inscrire sur resend.com
# 2. Domains > Add Domain > blolab.bj
# 3. Ajouter les DNS records indiqués (SPF, DKIM)
# 4. API Keys > Create API Key → RESEND_API_KEY
```

---

## PHASE 2 — Initialisation du Projet Next.js

```bash
# Cloner le repository
git clone https://github.com/blolab/crm-whatsapp.git
cd crm-whatsapp

# Installer les dépendances (pnpm recommandé)
pnpm install

# Copier et configurer les variables d'environnement
cp .env.example .env.local
```

Éditer `.env.local` avec toutes les clés récupérées dans la Phase 1.

```bash
# Vérifier que tout est en ordre
pnpm dev

# Aller sur http://localhost:3000
# → Doit afficher la page de login Supabase
```

---

## PHASE 3 — Créer le Premier Administrateur

```bash
# Option A : Via Supabase Dashboard
# Authentication > Users > Invite user
# Email: medard@blolab.bj

# Option B : Via SQL (si invite email désactivée)
```

```sql
-- Dans le SQL Editor Supabase :
-- 1. Créer l'utilisateur via Supabase Auth (récupérer son UUID)
-- SELECT id FROM auth.users WHERE email = 'medard@blolab.bj';

-- 2. Insérer son profil admin
INSERT INTO admin_users (id, full_name, email, role)
VALUES (
  '<UUID-RECUPERE-CI-DESSUS>',
  'Médard Agbayazon',
  'medard@blolab.bj',
  'super_admin'
);

-- 3. Créer les autres admins si besoin
INSERT INTO admin_users (id, full_name, email, role)
VALUES
  ('<UUID>', 'Agent 1', 'agent1@blolab.bj', 'agent'),
  ('<UUID>', 'Agent 2', 'agent2@blolab.bj', 'agent');
```

---

## PHASE 4 — Déploiement sur Vercel

```bash
# Installer Vercel CLI
npm install -g vercel

# Se connecter
vercel login

# Déployer (première fois : configure automatiquement)
vercel

# Pour la production :
vercel --prod

# Ajouter toutes les variables d'environnement
# (plus rapide via le dashboard Vercel > Settings > Environment Variables)
# Ou via CLI :
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add WASENDER_API_KEY production
vercel env add WASENDER_SESSION_ID production
vercel env add WASENDER_WEBHOOK_SECRET production
vercel env add GOOGLE_GENERATIVE_AI_API_KEY production
vercel env add OPENAI_API_KEY production
vercel env add GROQ_API_KEY production
vercel env add RESEND_API_KEY production
vercel env add ALERT_EMAIL_TO production
vercel env add TELEGRAM_BOT_TOKEN production
vercel env add TELEGRAM_ALERT_CHAT_ID production
vercel env add NEXT_PUBLIC_APP_URL production
vercel env add CRON_SECRET production
```

```bash
# Redéployer après ajout des variables
vercel --prod

# Vérifier les crons Vercel
# Dashboard Vercel > Settings > Cron Jobs
# Les 3 crons doivent apparaître :
# - /api/cron/scrape          (lundi 3h)
# - /api/cron/session-check   (toutes les 5min)
# - /api/cron/broadcast       (toutes les 5min)
```

---

## PHASE 5 — Configurer le Domaine

```bash
# Dans Vercel Dashboard > Settings > Domains
# Ajouter : crm.blolab.bj
# Ajouter l'enregistrement DNS chez votre registrar :
#   CNAME  crm  →  cname.vercel-dns.com
# 
# Vérifier SSL : https://crm.blolab.bj doit être sécurisé (HTTPS automatique)
```

---

## PHASE 6 — Premier Scraping de la Base de Connaissances

```bash
# 1. Se connecter au dashboard : https://crm.blolab.bj/login
# 2. Aller dans Agent IA
# 3. Cliquer "Actualiser blolab.bj"
# 4. Attendre la fin du scraping (observer dans scraping_jobs)
# 5. Tester dans le Playground :
#    Question : "C'est quoi Ecole229 ?"
#    → Des chunks pertinents doivent apparaître avec score > 0.75
```

---

## PHASE 7 — Tests de Validation

### Checklist Webhook

```bash
# Depuis un téléphone test, envoyer au numéro WhatsApp BloLab :

# Test 1 — Message texte simple
"Bonjour"
# Attendu : Message de bienvenue + opt-in + demande du prénom

# Test 2 — Question sur une formation
"Quelles formations proposez-vous ?"
# Attendu : Réponse IA avec infos de la KB

# Test 3 — Hors périmètre
"Quel est le taux de change euro/CFA ?"
# Attendu : "Je ne dispose pas de cette info, je vous transfère…"

# Test 4 — Mot-clé escalade
"Je veux parler à un humain"
# Attendu : Message de transfert + statut conversation = escalated

# Test 5 — STOP
"STOP"
# Attendu : Confirmation désinscription + opt_in = false en DB

# Test 6 — Message vocal
# Envoyer un vocal en français
# Attendu : Transcription apparaît dans dashboard + réponse IA si score > 0.80
```

### Checklist Dashboard

```bash
# [ ] Login admin fonctionne
# [ ] Inbox affiche les conversations en temps réel
# [ ] Badge session WhatsApp vert visible
# [ ] Prise de contrôle (takeover) fonctionne
# [ ] Réponse admin depuis le dashboard envoyée sur WhatsApp
# [ ] Fiche contact créée automatiquement
# [ ] Analytics affiche des données après 24h
# [ ] Broadcast : créer, envoyer, voir rapport
```

### Checklist Sécurité

```bash
# [ ] Webhook sans signature HMAC → rejeté (401)
# [ ] Route API dashboard sans JWT → redirigé vers /login
# [ ] CRON_SECRET manquant → cron rejeté (401)
# [ ] SUPABASE_SERVICE_ROLE_KEY non exposée dans le navigateur
#     (vérifier : aucune variable sans NEXT_PUBLIC_ dans les source maps)
```

---

## PHASE 8 — Environnement Staging

```bash
# Créer un second projet Supabase : "BloLab CRM Staging"
# Créer un second projet Vercel : crm-staging.blolab.bj
# Utiliser un SECOND numéro WhatsApp dédié aux tests

# Les variables d'environnement Staging :
# - NEXT_PUBLIC_APP_URL=https://crm-staging.blolab.bj
# - Supabase Staging URL/Keys
# - WaSenderAPI session numéro test
# - Même clés LLM/STT (pas de distinction nécessaire)

# Workflow de déploiement recommandé :
# Code → Staging (tests) → Production
```

---

## Maintenance & Opérations

### Mise à jour du code

```bash
git pull origin main
vercel --prod   # Redéploie automatiquement
```

### Ajouter un nouvel admin

```sql
-- 1. Inviter l'email via Supabase Auth Dashboard
-- 2. Après acceptation :
INSERT INTO admin_users (id, full_name, email, role)
VALUES ('<UUID>', 'Prénom Nom', 'email@blolab.bj', 'agent');
```

### Rollback de la base de connaissances

```bash
# Si un scraping dégrade la qualité des réponses IA :
# Dashboard > AI Agent > Versions > Restaurer version N-1
# Ou via API :
curl -X POST https://crm.blolab.bj/api/knowledge/rollback \
  -H "Authorization: Bearer <JWT>" \
  -d '{"targetVersion": 3}'
```

### Blacklister un numéro

```sql
UPDATE contacts
SET is_blacklisted = true,
    blacklisted_at = NOW(),
    blacklisted_reason = 'Spam'
WHERE whatsapp_number = '+22991XXXXXX';
```

### Surveiller les logs

```bash
# Vercel Dashboard > Logs (Realtime logs)
# Supabase Dashboard > Logs > API (requêtes DB)
# Table ai_logs → Toutes les décisions IA enregistrées
```

---

*Section 13 complète. Toutes les sections de la spécification technique sont désormais terminées.*

---

## Récapitulatif final — Tous les fichiers du dossier TECH_SPEC

```
TECH_SPEC/
├── 00_PLAN_DE_TRAVAIL.md              Plan général
├── 01_STACK_ARCHITECTURE.md           Stack + schéma d'architecture
├── 02_BASE_DE_DONNEES.md              Schéma SQL complet
├── 03_WORKFLOW_WEBHOOK_RECEPTION.md   W1 — Réception messages
├── 04_WORKFLOW_RAG_IA.md              W2 — Pipeline IA + profilage
├── 05_WORKFLOW_VOCAL_STT.md           W3 — Transcription vocaux
├── 06_WORKFLOW_SCRAPING_RAG.md        W4 — Scraping KB
├── 07_WORKFLOW_BROADCAST.md           W5 — Campagnes WhatsApp
├── 08_WORKFLOW_MONITORING_SESSION.md  W6 — Monitoring connexion
├── 09_API_ENV_DEPLOIEMENT.md          Routes API + env + déploiement
├── 11_FRONTEND_PAGES_COMPOSANTS.md    Pages et composants UI
├── 12_ENV_CONFIGURATION.md            .env.example + configs
├── 13_GUIDE_DEPLOIEMENT.md            Guide step-by-step complet
└── SPEC_TECHNIQUE_COMPLETE.md         Index général
```

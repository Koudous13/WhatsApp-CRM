# Audit 360 — CRM WhatsApp BloLab

**Date** : 2026-04-24
**Commit audité** : `7d663ca` (branche `main`)
**Périmètre** : audit de reprise / handover, statique + dynamique local (ESLint, `tsc --noEmit`, `npm audit`)
**Auditeur** : Claude Opus 4.7 (1M context)

---

## Sommaire exécutif

Le projet est fonctionnellement avancé (40+ routes API, pipeline RAG riche avec outils DeepSeek, système de programmes dynamiques avec DDL à la volée, broadcast avec segments) mais présente **une posture de sécurité incompatible avec une mise en prod** et une **dette de maintenabilité** qui rendrait une reprise très coûteuse en l'état.

### Scores par axe (sur 5)

| Axe | Score | Verdict |
|---|---|---|
| Sécurité | **0/5** | Bloquant — webhook non authentifié, aucune protection des routes API, RLS ouvertes, fuite PII dans logs, SQL injection via route publique |
| Architecture / qualité code | **2/5** | Stack moderne, code lisible, mais 178 erreurs ESLint, 44 `any` dans les routes API, aucune validation runtime |
| Base de données / migrations | **1/5** | 6 migrations sans ordre, conflit de table, politiques RLS permissives partout, fonction `admin_execute_sql` dangereuse |
| Gap fonctionnel vs SPEC | **2/5** | STT vocal absent, scraping auto absent, divergence LLM (spec=Gemini, code=DeepSeek) |
| UX / Frontend | **2/5** | 7 pages fonctionnelles mais aucun `loading.tsx`/`error.tsx`, Realtime uniquement sur Inbox, composants non partagés |
| DevOps / déploiement | **1/5** | Aucun test, pas de CI/CD, pas de `.env.example`, README = boilerplate, pas de `vercel.json` |

### Top 5 risques bloquants pour une reprise

1. **Le webhook WhatsApp n'est pas authentifié** — la fonction HMAC est écrite mais jamais appelée (`app/app/api/webhooks/wasender/route.ts:9-15`). N'importe qui peut injecter des messages et déclencher des réponses IA payantes.
2. **Aucune route API n'est protégée** — `middleware.ts:12` exclut `/api/*`. Un inconnu peut créer des broadcasts, supprimer des programmes, exécuter `admin_execute_sql`.
3. **Les policies RLS sont ouvertes à tous** — `USING (true) WITH CHECK (true)` sur toutes les tables vues. L'anon key du navigateur suffit pour tout lire/écrire, même si l'auth applicative était corrigée.
4. **Fuite systématique de PII et de signatures HMAC dans `ai_logs`** — `webhooks/wasender/route.ts:22-27` enregistre le body brut et tous les headers avant toute validation. Risque RGPD + exposition des secrets.
5. **Impossible de reconstruire la DB localement** — 6 fichiers SQL + 3 scripts `.mjs/.js`, sans ordre ni idempotence garantie. Deux migrations créent `Inbox_Categories` avec des définitions divergentes.

### Top 5 quick wins (< 2h chacun)

1. **Appeler `validateHmac()`** dans le handler du webhook (3 lignes) — ferme la porte ouverte sur l'internet.
2. **Retirer le bloc DEBUG EXTRÊME** (`webhooks/wasender/route.ts:21-27`) — stoppe la fuite PII/secrets.
3. **Étendre le `middleware` aux routes `/api/*`** sauf webhook / login / cron — ajoute une couche d'auth globale.
4. **Déplacer `app/api/broadcast/update/route.ts` vers `app/app/api/broadcast/update/route.ts`** — la route est au mauvais endroit, Next.js ne la sert pas.
5. **Créer `app/.env.example`** — un nouveau dev peut démarrer en 10 minutes au lieu de 2 jours.

---

## 1. Méthodologie

**Statique** : lecture de `middleware.ts`, `lib/supabase/*`, `lib/ai/*`, `lib/broadcast/sender.ts`, `lib/wasender/client.ts`, tous les fichiers SQL, les 7 pages dashboard, un échantillon de 12 routes API sur 40, tous les fichiers de spec (`TECH_SPEC/`, `CDC_*`, `DASHBOARD_V2_VISION.md`, `PLAN_ACTION_V2_EXTENDED.md`).

**Dynamique local** :
- `npm install` → 551 packages, **6 vulnérabilités (2 moderate, 4 high)**
- `npx tsc --noEmit` → **exit 0** (le typage passe — bien, car `noImplicitAny` probablement désactivé)
- `npm run lint` → **219 problèmes (178 erreurs, 41 warnings)**
- `npm run build` → non exécuté (nécessite `.env.local` avec secrets)

**Non couvert** : tests end-to-end, audit de pénétration réel, vérification des policies RLS en environnement Supabase live, vérification de l'état de `vercel.json` (absent).

---

## 2. Inventaire

### 2.1 Routes API (41 routes)

| Route | Méthodes | Protection | Rôle |
|---|---|---|---|
| `/api/webhooks/wasender` | POST | ❌ `validateHmac` non appelée | Réception messages WhatsApp |
| `/api/broadcast/create` | POST | ❌ aucune | Création campagne |
| `/api/broadcast/delete` | POST | ❌ aucune | Suppression campagne |
| `/api/broadcast/test` | GET | ❌ aucune (expose API_KEY prefix selon exploration) | Test envoi |
| `/api/broadcast/tick` | GET | ✅ `Bearer CRON_SECRET` | Exécution broadcasts planifiés |
| `/api/broadcast/sequence/create`, `[id]` | POST, GET/PATCH/DELETE | ❌ aucune | Séquences multi-messages |
| `/api/broadcast/update` | ? | ⚠️ **au mauvais endroit** (`app/api/...` au lieu de `app/app/api/...`) | Mise à jour (mort ?) |
| `/api/messages/send` | POST | ❌ aucune | Envoi message direct (spam possible) |
| `/api/messages/handover` | POST | ❌ aucune | Bascule IA ↔ humain |
| `/api/programmes`, `[id]` | GET/POST, PATCH/DELETE | ❌ aucune | CRUD programmes (**DDL dynamique**) |
| `/api/setup/programmes` | POST | ❌ aucune | Setup initial |
| `/api/inscription`, `[id]`, `create` | GET/POST | ❌ aucune | Gestion inscriptions |
| `/api/inscriptions/[slug]`, `bulk` | GET/POST/PATCH | ❌ aucune | Inscriptions par programme |
| `/api/knowledge/add`, `delete`, `list`, `scrape`, `update`, `upload` | POST/GET | ❌ aucune | CRUD base de connaissances |
| `/api/maintenance/*` (3 routes) | GET/POST | ❌ aucune | **Exécution de SQL de migration** |
| `/api/settings/prompt` | GET/POST | ❌ aucune | **Modification du prompt système IA** |
| `/api/analytics/briefing`, `override` | GET/POST | ❌ aucune | Analytics + overrides manuels |
| `/api/auth/callback` | GET | (bypass middleware) | OAuth callback Supabase |

**Verdict** : **1 route sur 41 authentifiée** (celle du cron broadcast). Tout le reste est ouvert à l'internet.

### 2.2 Pages dashboard (7 pages)

| Page | Realtime | États (loading/error/empty) | Points forts | Points faibles |
|---|---|---|---|---|
| `/inbox` | ✅ Supabase channels | ⚠️ pas de `loading.tsx`/`error.tsx` | Realtime sur conversations + messages, Zen mode, catégories | Lint : 7 erreurs `any`, requête directe Supabase avec anon key |
| `/broadcast` | ❌ polling implicite | idem | 3 étapes wizard, segments, variantes A/B, CSV upload | Lint : **23 erreurs + 15 warnings**, `loadingSequences` inutilisée |
| `/contacts` | ❌ | idem | Import/export, segments | Lint : 3 erreurs `any` |
| `/analytics` | ❌ | idem | Graphiques Recharts, overrides manuels | **Bug React** : `setState` dans `useEffect` (analytics/page.tsx:108), 6 erreurs ESLint |
| `/knowledge` | ❌ | idem | Upload + scraping manuel | — |
| `/programmes` | ❌ | idem | Schéma dynamique, DDL à la volée | Dépend de `admin_execute_sql` (dangereux) |
| `/settings` | ❌ | idem | Modification du prompt IA | Route `/api/settings/prompt` non protégée |

**Layout** : `app/app/(dashboard)/layout.tsx` est un simple `<Sidebar /> + <main>`. Aucun header, aucun breadcrumb, aucune gestion d'erreur globale.

### 2.3 Migrations SQL

Ordre reconstitué (heuristique) :

1. `app/setup_v2.sql` — crée `programmes`, `stats_overrides`, vue `stats_programmes_view`
2. `app/setup_v3_dynamic_tables.sql` — crée **`admin_execute_sql(text)` SECURITY DEFINER** + `programme_schema` + `programme_colonnes`
3. `app/supabase_schema_update.sql` — ⚠️ **contient des caractères corrompus (mojibake)** — crée `public.Inbox_Categories` (sans guillemets)
4. `app/MIGRATION_V2_INBOX.sql` — crée `public."Inbox_Categories"` (avec guillemets) + ajoute `category_id` à `conversations`
5. `app/SQL_MIGRATION_INSCRIPTIONS.sql` — crée `public."Inscriptions"`
6. `app/SQL_MIGRATION_SMART_SEGMENTS.sql` — crée `public."Smart_Segments"`

Plus :
- `app/migrate.js` — orchestrateur qui appelle `admin_execute_sql` via REST
- `app/scripts/init_schema.mjs` — initialisation schéma
- `app/alter_table.mjs` — altérations ponctuelles
- `app/test_schema.mjs` — test de schéma

**Problèmes** :
- Le 3 et le 4 définissent `Inbox_Categories` différemment. Postgres les traite comme **deux tables distinctes** si exécutés dans l'ordre. La majorité du code utilise `"Inbox_Categories"` (avec guillemets), donc la première version est vraisemblablement orpheline.
- Aucune idempotence garantie (certains scripts ont `IF NOT EXISTS`, d'autres pas).
- Aucune table de tracking des migrations appliquées.
- **Tables jamais créées explicitement dans aucun SQL** : `Profil_Prospects`, `conversations`, `messages`, `broadcasts`, `ai_logs`, `knowledge_base`, `programme_champs`, `broadcast_sequences`. Elles ont été créées via la console Supabase ou un script perdu.

### 2.4 Dépendances externes (points d'entrée)

| Service | Usage | Point d'entrée |
|---|---|---|
| Supabase | DB + Auth + Realtime | `lib/supabase/{client,server}.ts` |
| WaSenderAPI | WhatsApp send/receive | `lib/wasender/client.ts`, `app/api/webhooks/wasender/route.ts` |
| DeepSeek (via OpenAI SDK) | LLM principal | `lib/ai/rag-pipeline.ts:8-11` |
| Google Generative AI | Embeddings uniquement | `lib/ai/embeddings.ts` |
| OpenAI | Présent en dépendance mais usage réel = DeepSeek via baseURL | `@google/generative-ai`, `openai` |
| Groq | STT Whisper | ❌ **aucun usage trouvé** (spec W3 dit contraire) |
| Resend | Emails | ❌ **aucun usage trouvé** (deps non présente dans package.json non plus) |
| Telegram | Alertes équipe | `lib/notifications/telegram.ts` |

### 2.5 Documentation

| Document | Statut | Valeur pour handover |
|---|---|---|
| `TECH_SPEC/00_PLAN_DE_TRAVAIL.md` | À jour partiellement | Moyen — montre l'intention, pas l'état |
| `TECH_SPEC/01_STACK_ARCHITECTURE.md` | ⚠️ divergent — dit Next 16, Gemini, structure idéale | Faible — code réel diverge fort |
| `TECH_SPEC/02_BASE_DE_DONNEES.md` | ⚠️ non vérifié mais probablement obsolète | Faible |
| `TECH_SPEC/03-08` | ⚠️ vision, pas implémentation | Faible — confond spec et réel |
| `TECH_SPEC/MVP.md` | À confronter au livré | Moyen |
| `TECH_SPEC/14_UX_AUDIT_PROPOSITIONS.md`, `15_VISION_UX_V2.md`, `DASHBOARD_V2_VISION.md`, `PLAN_ACTION_V2_EXTENDED.md` | Visions V2 **non implémentées** | Faible (pour handover) / Fort (pour produit) |
| `CDC_BloLab_Dashboard_CRM_IA_v2.md` | Cahier des charges | Fort |
| `app/README.md` | **Boilerplate `create-next-app`** | ❌ Zéro |
| `README.md` racine | ❌ absent | ❌ Zéro |

**Conclusion** : la documentation décrit une cible idéale, pas l'état réel. Un repreneur aurait besoin de ce document AUDIT.md comme source de vérité.

### 2.6 Fichiers orphelins / à clarifier

| Élément | Lieu | Statut |
|---|---|---|
| `ASSISTANT RAG IA WHATSAPP PROFILAGE.json` | racine | Orphelin — pas référencé par le code |
| `Knowledge_V4_Chunks/` (13 fichiers txt) | racine | Ingérés par `scripts/import-kb.mjs` (non documenté) |
| `blolab_*.md` (4 fichiers de knowledge) | racine | Probablement ingérés manuellement |
| `app/test-context-enricher.ts`, `test-deepseek-tool.ts`, `test-dump.ts`, `test-telegram.js`, `test_schema.mjs` | racine de `app/` | Scripts ad-hoc, non intégrés à une suite de tests |
| `app/alter_table.mjs`, `app/migrate.js`, `app/scripts/init_schema.mjs` | — | Scripts d'administration DB, non documentés |
| `app/lib/ai/lead-profiler.ts` | — | **Dead code** — non importé |
| `app/hooks/useSound.ts` | — | Référencé ? à vérifier |
| `analytics_v2_mockup_*.png` | racine | Mockup de référence |
| `app/.test-build*` (listés dans .gitignore) | — | Artefacts de test de build |
| `app/api/broadcast/update/route.ts` | **mauvais chemin** — devrait être `app/app/api/broadcast/update/route.ts` | Route morte |

---

## 3. Findings par sévérité

### 🔴 Critique (bloquant pour prod)

#### CRIT-01 — Webhook WaSenderAPI sans validation HMAC effective
**Fichier** : `app/app/api/webhooks/wasender/route.ts:17-32`
**Observation** : la fonction `validateHmac(body, signature)` est définie ligne 9-15 mais **jamais appelée** dans `POST`. Le header `x-webhook-signature` est lu ligne 30 puis ignoré. Le commentaire "AUCUNE VERIFICATION STRICTE D'EVENT ICI POUR DEBUG" ligne 41 confirme un état de debug laissé en place.
**Risque** : n'importe qui connaissant l'URL du webhook peut injecter des messages fictifs dans la base, déclencher des réponses IA facturées, forger des opt-out, corrompre les `Profil_Prospects`. Les URLs Vercel sont publiques.
**Correction** : appeler `validateHmac(rawBody, signature)` en début de POST, renvoyer 401 si faux. Utiliser `crypto.timingSafeEqual` pour la comparaison. Ajouter un timestamp dans le header et rejeter les messages > 5 min.
**Effort** : S (30 min)
**Ticket** : `AUDIT_TICKETS/CRIT-01-webhook-hmac-validation.md`

#### CRIT-02 — Toutes les routes API sont ouvertes à l'internet
**Fichier** : `app/middleware.ts:11-14`
**Observation** : `if (pathname.startsWith('/api') || pathname.startsWith('/_next')) { return res }` — les routes API sont exclues avant même le test des routes protégées. Aucune route (sauf `/api/broadcast/tick` avec `CRON_SECRET`) ne vérifie `supabase.auth.getUser()` elle-même.
**Risque** :
- `POST /api/broadcast/create` : lancer des campagnes WhatsApp massives depuis l'extérieur
- `POST /api/messages/send` : spam via ton numéro WhatsApp
- `POST /api/programmes` : créer des tables arbitraires via `admin_execute_sql`
- `DELETE /api/programmes/[id]` : dropper des tables
- `POST /api/settings/prompt` : altérer le comportement de l'IA
- `POST /api/maintenance/*` : exécuter des migrations SQL
**Correction** : modifier `middleware.ts` pour inclure `/api/*` dans les routes protégées, avec une whitelist pour `/api/webhooks/wasender`, `/api/auth/callback`, `/api/broadcast/tick`. En parallèle, chaque route sensible doit vérifier `getUser()` localement en défense en profondeur.
**Effort** : M (3–4h)
**Ticket** : `AUDIT_TICKETS/CRIT-02-protect-api-routes.md`

#### CRIT-03 — Policies RLS Supabase en `USING (true) WITH CHECK (true)`
**Fichiers** : `app/SQL_MIGRATION_INSCRIPTIONS.sql:41-43`, `app/SQL_MIGRATION_SMART_SEGMENTS.sql:17-22`, `app/MIGRATION_V2_INBOX.sql:21`, et par extrapolation les autres tables (à vérifier en console Supabase)
**Observation** : toutes les policies vues permettent lecture et écriture à n'importe qui authentifié (ou même non authentifié via anon key). Combiné avec l'utilisation de `createClient` (anon key) côté navigateur dans Inbox/Broadcast/Contacts, la DB est effectivement lisible publiquement.
**Risque** : fuite de données prospect (numéros WhatsApp, conversations, statuts), modification par n'importe qui, absence de barrière même si l'auth applicative est corrigée.
**Correction** : policies scoped par `auth.uid()` pour l'admin unique, ou table `admin_users` avec vérification `auth.uid() IN (SELECT user_id FROM admin_users)`. Tables accessibles uniquement via `service_role` pour les données prospect.
**Effort** : L (1 journée)
**Ticket** : `AUDIT_TICKETS/CRIT-03-rls-policies.md`

#### CRIT-04 — Fonction `admin_execute_sql` SECURITY DEFINER
**Fichier** : `app/setup_v3_dynamic_tables.sql:12-17`
**Observation** : fonction PostgreSQL qui exécute une chaîne SQL arbitraire avec les droits du propriétaire. Le commentaire dit "ne doit être appelée QUE par le serveur Next.js avec la clé SERVICE_ROLE" mais techniquement rien ne l'empêche : si `GRANT EXECUTE ... TO anon` ou `PUBLIC` a été accordé, la fonction est accessible avec la clé publique.
**Risque** : `DROP TABLE`, `SELECT * FROM` toutes les tables auth.users de Supabase, exécution de commandes d'extensions, etc.
**Correction** :
1. Vérifier les GRANTs : `SELECT * FROM information_schema.routine_privileges WHERE routine_name = 'admin_execute_sql';`
2. Révoquer explicitement : `REVOKE ALL ON FUNCTION admin_execute_sql(text) FROM PUBLIC, anon, authenticated;`
3. Accorder uniquement à `service_role` si absolument nécessaire.
4. Mieux : remplacer par des fonctions Postgres typées (`admin_create_program_table(slug, columns jsonb)`) qui valident et composent le DDL en interne.
**Effort** : M (4h avec tests)
**Ticket** : `AUDIT_TICKETS/CRIT-04-secure-admin-execute-sql.md`

#### CRIT-05 — Injection SQL via concaténation dans `/api/programmes` (POST)
**Fichier** : `app/app/api/programmes/route.ts:160-180`
**Observation** : construction de `columnsSql` et `valuesSql` par concaténation de strings, envoyés à `admin_execute_sql`. La protection `.replace(/'/g, "''")` couvre les valeurs string mais **pas les noms de colonnes entre guillemets doubles** (`"${col}"`). Or `allColumns` vient de `Object.keys(row)` où `row` provient du body JSON de la requête (CSV importé + fields du payload). Couplé à CRIT-02 (route non protégée), un attaquant peut envoyer un payload malveillant.
**Risque** : injection SQL arbitraire via le POST `/api/programmes`, y compris création/suppression de tables, exécution d'extensions, etc.
**Correction** : abandonner la construction SQL à la main. Utiliser le SDK Supabase (`supabase.from(tableName).insert(rows)`) après avoir créé la table via DDL, au lieu de passer par `admin_execute_sql` pour un bulk insert. Si `admin_execute_sql` reste nécessaire pour contourner le cache PostgREST, valider strictement chaque nom de colonne contre `^[a-z][a-z0-9_]*$`.
**Effort** : M (3h avec tests)
**Ticket** : `AUDIT_TICKETS/CRIT-05-sanitize-sql-construction.md`

#### CRIT-06 — Fuite de PII et signatures HMAC dans la table `ai_logs`
**Fichier** : `app/app/api/webhooks/wasender/route.ts:21-27`
**Observation** : bloc "🔥 DEBUG EXTRÊME" qui persiste `rawBody` (corps complet incluant numéros WhatsApp et contenu des messages) et `JSON.stringify(req.headers)` (qui inclut `x-webhook-signature`, `authorization`, etc.) dans la table `ai_logs`. S'exécute **avant toute validation**, donc même les appels malveillants sont loggués.
**Risque** :
- RGPD : contenu de messages privés stocké en clair, sans rétention définie.
- Sécurité : la signature HMAC peut être analysée à partir des logs pour forger des signatures valides (avec le secret).
- Coûts : table qui grossit sans limite.
**Correction** : supprimer le bloc. Si le debug est nécessaire, logger à minima (event type, chat_id tronqué, sans body ni headers). Ajouter une politique de rétention (TTL 30j) sur `ai_logs`.
**Effort** : S (15 min)
**Ticket** : `AUDIT_TICKETS/CRIT-06-remove-debug-logging.md`

#### CRIT-07 — `admin_execute_sql` atteignable via contenu utilisateur
**Fichier** : `app/lib/ai/context-enricher.ts:85-97`
**Observation** : le `chatId` (provenant du webhook WhatsApp, donc externe) est concaténé dans une requête SQL exécutée via `admin_execute_sql`. La protection `chatId.replace(/'/g, "''")` limite, mais ne couvre pas les cas où `admin_execute_sql` recevrait un payload multi-statements.
**Risque** : injection SQL second-order via un message WhatsApp crafté, si jamais le `chatId` contient des caractères exotiques passés entre `'...'`.
**Correction** : passer `chatId` comme paramètre Postgres (via `ANY($1)`) au lieu d'une concaténation. Ou mieux : utiliser `supabase.from(table).select().eq('chat_id', chatId)` en itérant sur chaque table, sans passer par `admin_execute_sql`.
**Effort** : S (1–2h)
**Ticket** : `AUDIT_TICKETS/CRIT-07-context-enricher-sql-safe.md`

### 🟠 Haute (à corriger rapidement)

#### HIGH-01 — Aucune validation des inputs (absence totale de Zod/schémas)
**Observation** : 0 fichier du projet n'importe Zod. Les 40+ routes API lisent directement `await req.json()` sans typer ni valider. 44 occurrences de `: any` dans les routes API.
**Risque** : erreurs runtime, bugs silencieux, échecs d'insertion SQL, failles si un champ inattendu est passé à `Object.entries().forEach()` (ex : prompt injection via un champ texte non prévu).
**Correction** : ajouter `zod` en dépendance, créer un schéma par route sensible, valider en entrée de handler.
**Effort** : L (1 semaine pour couvrir les 40 routes)
**Ticket** : `AUDIT_TICKETS/HIGH-01-input-validation-zod.md`

#### HIGH-02 — Route `/api/broadcast/update` au mauvais chemin
**Fichier** : `app/api/broadcast/update/route.ts` (devrait être `app/app/api/broadcast/update/route.ts`)
**Observation** : le dossier `app/api/` à la racine de `app/` ne correspond pas à la convention Next.js App Router. Le fichier `route.ts` qui s'y trouve n'est pas servi.
**Risque** : fonctionnalité morte (si elle était utilisée), ou code mort (si elle ne l'est pas).
**Correction** : déplacer vers `app/app/api/broadcast/update/route.ts` ou supprimer si obsolète.
**Effort** : S (10 min + vérifier les appelants)
**Ticket** : `AUDIT_TICKETS/HIGH-02-fix-broadcast-update-path.md`

#### HIGH-03 — 178 erreurs ESLint
**Observation** : `npm run lint` remonte **178 erreurs + 41 warnings**. Principaux types :
- 44+ `@typescript-eslint/no-explicit-any` dans les pages et routes API
- `react/no-unescaped-entities` (apostrophes non échappées) dans plusieurs pages
- `react-hooks/exhaustive-deps` (dépendances manquantes)
- `@typescript-eslint/no-require-imports` (mélange CommonJS/ESM)
- `react-hooks/set-state-in-effect` — **bug de perf** dans `analytics/page.tsx:108`
**Risque** : code fragile, bugs silencieux, dérive de qualité.
**Correction** : `npm run lint -- --fix` corrige ~5 erreurs. Le reste demande un nettoyage progressif.
**Effort** : M (2–3 jours pour tout nettoyer)
**Ticket** : `AUDIT_TICKETS/HIGH-03-fix-eslint-errors.md`

#### HIGH-04 — Bug React : `setState` dans `useEffect` (Analytics)
**Fichier** : `app/app/(dashboard)/analytics/page.tsx:108`
**Observation** : `useEffect(() => { fetchData() }, [])` où `fetchData()` appelle `setState` synchronously → cascading renders. React 19 le signale officiellement.
**Risque** : performance dégradée, état inconsistent possible.
**Correction** : pattern `useEffect(() => { let cancelled = false; async function run() { const data = await fetch(...); if (!cancelled) setState(data) } run(); return () => { cancelled = true } }, [])`.
**Effort** : S (30 min)
**Ticket** : `AUDIT_TICKETS/HIGH-04-analytics-setstate-effect.md`

#### HIGH-05 — 6 vulnérabilités npm (2 moderate + 4 high)
**Observation** : `npm install` rapporte 6 vulnérabilités. Non analysées en détail.
**Correction** : `npm audit` pour lister, `npm audit fix` pour corriger ce qui est auto-fixable. Évaluer `npm audit fix --force` manuellement.
**Effort** : S (1h)
**Ticket** : `AUDIT_TICKETS/HIGH-05-npm-audit-fix.md`

#### HIGH-06 — Divergence LLM : spec = Gemini, code = DeepSeek
**Fichier** : `app/lib/ai/rag-pipeline.ts:8-11`
**Observation** : le code utilise DeepSeek via le SDK OpenAI (`baseURL: https://api.deepseek.com`). La spec `TECH_SPEC/01_STACK_ARCHITECTURE.md` annonce Gemini 2.0 Flash. Aucun fallback. Le package `@google/generative-ai` est installé mais sert uniquement pour les embeddings. `openai` est installé mais non utilisé (seulement comme SDK pour DeepSeek).
**Risque** : coût, performance, qualité — décision non documentée. En cas d'indisponibilité DeepSeek, tout l'agent IA tombe sans fallback.
**Correction** : décision produit à prendre — rester sur DeepSeek (et mettre à jour la spec, documenter les tarifs) ou repasser sur Gemini. Dans les deux cas, implémenter un fallback.
**Effort** : M (4h–1j pour la décision et le fallback)
**Ticket** : `AUDIT_TICKETS/HIGH-06-llm-decision-gemini-vs-deepseek.md`

#### HIGH-07 — STT vocal (W3) absent
**Fichier attendu** : `app/lib/ai/stt/` (n'existe pas)
**Fichier observé** : `app/app/api/webhooks/wasender/route.ts:183-192` — tout message non-texte escalade directement vers humain.
**Observation** : la spec `TECH_SPEC/05_WORKFLOW_VOCAL_STT.md` décrit un pipeline complet (Groq/Whisper + fallback Gemini Audio, confidence scoring, tag langue vernaculaire). Aucune de ces pièces n'est implémentée. `GROQ_API_KEY` dans la spec env mais pas dans le code.
**Risque** : feature annoncée non livrée ; coût humain croissant si beaucoup de vocaux.
**Correction** : décision produit — implémenter ou retirer de la spec. Si implémenté, suivre la spec W3 avec Groq comme provider principal.
**Effort** : L (3–5 jours)
**Ticket** : `AUDIT_TICKETS/HIGH-07-implement-or-drop-stt.md`

#### HIGH-08 — Scraping auto blolab.bj (W4) absent
**Fichier attendu** : cron Vercel + `lib/scraper/`
**Observation** : `cheerio` est en dépendance mais aucun cron auto visible. `/api/knowledge/scrape` existe (manuel). Pas de `vercel.json` → aucun cron Vercel configuré.
**Correction** : soit décider "scraping manuel uniquement" et aligner la spec, soit créer `vercel.json` avec cron hebdo et une route `/api/cron/scrape-blolab`.
**Effort** : M (1 jour)
**Ticket** : `AUDIT_TICKETS/HIGH-08-scraping-cron.md`

#### HIGH-09 — Migrations SQL conflictuelles et non ordonnées
**Fichiers** : `supabase_schema_update.sql` vs `MIGRATION_V2_INBOX.sql` (deux définitions de `Inbox_Categories`), `setup_v2.sql`, `setup_v3_dynamic_tables.sql`, etc.
**Observation** : 6 fichiers SQL + 3 scripts, pas de tracking des migrations appliquées, deux définitions divergentes de `Inbox_Categories`, `supabase_schema_update.sql` contient des caractères corrompus (mojibake) le rendant difficilement exécutable.
**Risque** : impossible de reconstruire la DB localement, divergence entre environnements, bugs lors du passage d'un environnement à un autre.
**Correction** : créer `app/supabase/migrations/<timestamp>_<name>.sql` selon la convention Supabase CLI, consolider les schémas existants en un seul `init.sql` reflétant l'état actuel, archiver les anciennes migrations.
**Effort** : L (1–2 jours avec dump de l'état prod + rebuild)
**Ticket** : `AUDIT_TICKETS/HIGH-09-consolidate-sql-migrations.md`

#### HIGH-10 — Aucun test automatisé
**Observation** : `package.json` ne contient ni `vitest`, ni `jest`, ni `playwright`, ni équivalent. Les 5 scripts `test-*.ts` sont des scripts ad-hoc, pas des tests.
**Risque** : aucune garantie lors de changements, aucune détection de régression, reprise impossible sans peur du bris.
**Correction** : installer `vitest`, écrire au minimum les tests des utilitaires purs (`lib/ai/context-enricher.ts::detectKeywords/decideRoute`, `lib/utils.ts`), puis des tests d'intégration sur les routes critiques.
**Effort** : L (3–5 jours pour un socle décent)
**Ticket** : `AUDIT_TICKETS/HIGH-10-add-test-suite.md`

#### HIGH-11 — `lib/ai/lead-profiler.ts` : dead code
**Fichier** : `app/lib/ai/lead-profiler.ts`
**Observation** : aucun import de ce fichier dans le projet. Le profilage est en fait réalisé par le tool `manage_crm_profile` défini dans `rag-pipeline.ts`.
**Risque** : confusion pour le repreneur ; code qui pourrit.
**Correction** : supprimer le fichier, ou documenter son état (archivé).
**Effort** : S (10 min)
**Ticket** : `AUDIT_TICKETS/HIGH-11-remove-lead-profiler.md`

#### HIGH-12 — Pas de rate limiting applicatif
**Observation** : aucune des routes API ne limite les appels. Un attaquant peut spammer `/api/broadcast/create`, `/api/messages/send`, ou saturer l'IA via le webhook.
**Risque** : explosion des coûts DeepSeek / Supabase, DOS, ban WhatsApp.
**Correction** : Upstash Redis + `@upstash/ratelimit`, ou rate limit natif Vercel.
**Effort** : M (1 jour)
**Ticket** : `AUDIT_TICKETS/HIGH-12-rate-limiting.md`

### 🟡 Moyenne (dette technique)

| ID | Titre | Effort | Ticket |
|---|---|---|---|
| MED-01 | Créer un vrai `README.md` + `app/README.md` (ou supprimer le boilerplate) | S | `MED-01-real-readme.md` |
| MED-02 | Créer `app/.env.example` documentant les 14 variables requises | S | `MED-02-env-example.md` |
| MED-03 | Organiser les scripts `test-*` orphelins : déplacer vers `scripts/dev-tools/` ou supprimer | S | `MED-03-organize-orphan-scripts.md` |
| MED-04 | Créer `vercel.json` avec les cron jobs (broadcast tick toutes les 5 min, scraping hebdo) | S | `MED-04-vercel-cron-config.md` |
| MED-05 | Ajouter `loading.tsx` + `error.tsx` + `not-found.tsx` à la racine du `(dashboard)` | M | `MED-05-loading-error-states.md` |
| MED-06 | Corriger le `.gitignore` racine : `*.json` est trop large, `/TECH_SPEC` est obsolète | S | `MED-06-fix-gitignore.md` |
| MED-07 | Supprimer ou restreindre `/api/broadcast/test` (exploration indique qu'elle expose des données) | S | `MED-07-remove-or-protect-broadcast-test.md` |
| MED-08 | Ajouter un système de rétention sur `ai_logs` (TTL 30j) | S | `MED-08-ai-logs-retention.md` |
| MED-09 | Implémenter la suppression RGPD (endpoint DELETE `/api/contacts/me` ou équivalent) | M | `MED-09-rgpd-delete.md` |
| MED-10 | Documenter l'ingestion de la knowledge base : `scripts/import-kb.mjs` + workflow | S | `MED-10-document-kb-ingestion.md` |
| MED-11 | Normaliser les noms de tables Postgres (abandonner `Profil_Prospects` en CamelCase) | L | `MED-11-normalize-table-names.md` |
| MED-12 | Centraliser l'usage de `createAdminClient()` : créer un wrapper qui logue qui l'appelle | M | `MED-12-admin-client-wrapper.md` |
| MED-13 | Ajouter des composants UI partagés (`components/ui/` — shadcn non installé malgré ce que dit la spec) | M | `MED-13-shadcn-ui-setup.md` |
| MED-14 | Réactiver la validation stricte des events dans le webhook (bloc retiré "TEMPORAIREMENT") | S | `MED-14-webhook-event-validation.md` |
| MED-15 | Configurer `tsconfig.json` avec `strict: true` et `noImplicitAny: true` | M | `MED-15-strict-typescript.md` |

### 🟢 Basse (nice to have)

| ID | Titre |
|---|---|
| LOW-01 | Nettoyer les `unused imports` (~12 warnings ESLint) |
| LOW-02 | Échapper les apostrophes dans le JSX (`react/no-unescaped-entities`) |
| LOW-03 | Ajouter les dépendances manquantes dans les `useEffect` |
| LOW-04 | Supprimer les `console.log` en production (`[DEBUG]`, `[Broadcast]`, etc.) |
| LOW-05 | Unifier les styles : une partie utilise Tailwind v4, composants custom, parfois classes adhoc |
| LOW-06 | Documenter les fichiers `blolab_*.md` à la racine — proviennent de versions successives ? |
| LOW-07 | Remplacer `any` par `unknown` en attendant la typification |
| LOW-08 | Ajouter un favicon / branding cohérent |

---

## 4. Gap fonctionnel vs TECH_SPEC

| Workflow | Spec | Code réel | État | Gravité |
|---|---|---|---|---|
| **W1 — Webhook Reception** | HMAC valide, dispatch texte/audio/image | HMAC défini mais non appelé, dispatch OK, debug logging excessif | Partiel + non sécurisé | **Critique** |
| **W2 — RAG IA texte** | Gemini 2.0 Flash, embeddings, pgvector, profilage silencieux, alerte Telegram lead chaud | DeepSeek via OpenAI SDK, embeddings Gemini, pgvector présent, 7 tools custom, alerte Telegram | Fonctionnel mais divergent | Haute |
| **W3 — STT vocal** | Whisper Groq + fallback Gemini Audio, confidence scoring, escalade selon score | **Absent** — escalade directe humain | Absent | Haute |
| **W4 — Scraping RAG auto** | Scraper Cheerio blolab.bj + cron hebdo + versioning | Uniquement scraping manuel via `/api/knowledge/scrape` | Partiel (manuel seul) | Moyenne |
| **W5 — Broadcast** | Segments CDP, scheduling, rate limiting, tracking read/delivered, opt-out | Segments smart, scheduling, rate limiting 6s + retry, tracking basique, opt-out OK via STOP | Fonctionnel | Faible |
| **W6 — Monitoring session** | Cron 5 min, badge dashboard, email alerte, page QR | **Absent** — aucune route visible, pas de vercel.json | Absent | Haute |

**Verdict** : 2 workflows majeurs (W3, W6) absents, 1 divergent (W2 = DeepSeek), 1 partiel (W4). W1 fonctionne mais est non sécurisé. W5 est le plus abouti.

---

## 5. Recommandations de reprise

### Ce qu'il faut documenter EN PREMIER pour un repreneur

1. **État réel de la base de données** : dumper le schéma actuel de la prod avec `pg_dump --schema-only` et créer un `init.sql` de référence.
2. **Variables d'environnement** : créer `app/.env.example` avec les 14 variables (liste dans le spec `09_API_ENV_DEPLOIEMENT.md`), annoter celles qui sont optionnelles.
3. **Décision LLM** : DeepSeek ou Gemini ? Documenter et faire converger spec et code.
4. **Liste des tables créées manuellement** (non vues dans les migrations) : `Profil_Prospects`, `conversations`, `messages`, `broadcasts`, `ai_logs`, `knowledge_base`, `programme_champs`, etc.

### Ce qu'il faut refactorer AVANT d'ajouter du neuf

1. **Sécurité d'abord** : CRIT-01 à CRIT-07. Sans ça, la prod est dangereuse.
2. **Suite de tests minimale** : au moins 10 tests unitaires pour `rag-pipeline.ts`, `context-enricher.ts`, `broadcast/sender.ts`. Sans tests, le risque de régression est énorme.
3. **Validation d'inputs** : Zod sur les 5 routes les plus sensibles (`/api/webhooks/wasender`, `/api/broadcast/create`, `/api/programmes`, `/api/messages/send`, `/api/settings/prompt`).
4. **Consolidation des migrations** : un seul `init.sql` + convention Supabase CLI.

### Décisions produit à trancher

- **STT vocal (W3)** : implémenter Groq/Whisper (~3-5j) ou l'enlever officiellement de la spec ?
- **Scraping auto (W4)** : cron hebdo (~1j) ou laisser manuel ?
- **Monitoring session (W6)** : cron 5 min + alerte email (~1j) ou monitoring externe (Better Uptime, etc.) ?
- **LLM principal** : DeepSeek (moins cher, support français moyen) ou Gemini (plus cher, meilleur support africain francophone) ?
- **Architecture multi-tenant ou mono-tenant** ? Aujourd'hui la DB est mono-tenant (toutes les données sans `user_id`/`org_id`). Si un deuxième client BloLab-like arrive, refonte nécessaire.

---

## 6. Roadmap suggérée

### Phase 1 — Sécurité critique (Semaine 1)

Ordre d'exécution suggéré :
1. CRIT-06 (retrait DEBUG) — 15 min
2. CRIT-01 (HMAC) — 30 min
3. CRIT-02 (protection routes API) — 4h
4. CRIT-04 (verrouillage `admin_execute_sql`) — 4h
5. CRIT-03 (RLS policies) — 1j
6. CRIT-05 + CRIT-07 (SQL injection) — 4h

### Phase 2 — Hygiène (Semaine 2-3)

- HIGH-01 (Zod sur routes critiques)
- HIGH-02 (fix chemin route)
- HIGH-03 (ESLint fix progressif)
- HIGH-04 (bug React analytics)
- HIGH-05 (npm audit)
- HIGH-09 (consolidation migrations SQL)
- HIGH-10 (socle de tests)
- HIGH-11 (suppression dead code)
- MED-01, MED-02, MED-04 (README + env + vercel.json)

### Phase 3 — Consolidation (Semaine 4+)

- HIGH-06 (décision LLM + fallback)
- HIGH-07 (STT ou drop)
- HIGH-08 (scraping ou drop)
- HIGH-12 (rate limiting)
- MED-05 à MED-15

---

## Annexes

### A. Commandes exécutées

```bash
cd app/
npm install            # 551 packages, 6 vulnerabilities (2 moderate, 4 high)
npx tsc --noEmit       # exit 0
npm run lint           # 219 problems (178 errors, 41 warnings)
npm run build          # NON EXÉCUTÉ (nécessite .env.local valide)
```

### B. Fichiers critiques lus (échantillon)

Sécurité : `middleware.ts`, `lib/supabase/{client,server}.ts`, `app/api/webhooks/wasender/route.ts`, `setup_v2.sql`, `setup_v3_dynamic_tables.sql`, `MIGRATION_V2_INBOX.sql`, `SQL_MIGRATION_INSCRIPTIONS.sql`, `SQL_MIGRATION_SMART_SEGMENTS.sql`, `supabase_schema_update.sql`.

API : `api/programmes/route.ts`, `api/broadcast/create/route.ts`, `api/broadcast/tick/route.ts`, `api/messages/send/route.ts`, `api/maintenance/sync-contacts/route.ts`.

Logique métier : `lib/ai/rag-pipeline.ts`, `lib/ai/context-enricher.ts`, `lib/ai/prompts.ts`, `lib/broadcast/sender.ts`.

UI : `app/(dashboard)/inbox/page.tsx`, `app/(dashboard)/broadcast/page.tsx`, `app/(dashboard)/layout.tsx`, `middleware.ts`.

Config : `package.json`, `next.config.mjs`, `tsconfig.json`, `.gitignore`.

### C. Références externes

- Specs : `TECH_SPEC/00-15`, `MVP.md`, `SPEC_TECHNIQUE_COMPLETE.md`
- Vision : `DASHBOARD_V2_VISION.md`, `PLAN_ACTION_V2_EXTENDED.md`, `CDC_BloLab_Dashboard_CRM_IA_v2.md`

---

*Rapport généré le 2026-04-24. Les tickets détaillés sont dans `AUDIT_TICKETS/`.*

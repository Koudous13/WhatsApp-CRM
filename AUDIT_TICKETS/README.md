# AUDIT_TICKETS — Index des tickets actionables

Tickets dérivés de [`../AUDIT.md`](../AUDIT.md). Chaque fichier est autonome : tu peux le donner à un dev (ou à Claude) et dire "attaque celui-là" sans contexte supplémentaire.

## Ordre d'exécution recommandé

### 🔴 Phase 1 — Sécurité critique (Semaine 1, < 2 jours de travail cumulé)

| Ordre | ID | Titre | Effort | Statut |
|---|---|---|---|---|
| 1 | [CRIT-06](CRIT-06-remove-debug-logging.md) | Supprimer le DEBUG EXTRÊME du webhook | S | ⬜ |
| 2 | [CRIT-01](CRIT-01-webhook-hmac-validation.md) | Activer la validation HMAC du webhook | S | ⬜ |
| 3 | [MED-14](MED-14-webhook-event-validation.md) | Restaurer la validation des events | S | ⬜ |
| 4 | [CRIT-04](CRIT-04-secure-admin-execute-sql.md) | Verrouiller `admin_execute_sql` | M | ⬜ |
| 5 | [CRIT-02](CRIT-02-protect-api-routes.md) | Protéger les routes API (middleware + getUser) | M | ⬜ |
| 6 | [CRIT-07](CRIT-07-context-enricher-sql-safe.md) | Context-enricher SQL-safe | S | ⬜ |
| 7 | [CRIT-05](CRIT-05-sanitize-sql-construction.md) | Assainir la construction SQL dynamique | M | ⬜ |
| 8 | [CRIT-03](CRIT-03-rls-policies.md) | Corriger les policies RLS | L | ⬜ |

### 🟠 Phase 2 — Hygiène (Semaine 2-3)

| ID | Titre | Effort | Statut |
|---|---|---|---|
| [HIGH-02](HIGH-02-fix-broadcast-update-path.md) | Corriger le chemin de `/api/broadcast/update` | S | ⬜ |
| [HIGH-11](HIGH-11-remove-lead-profiler.md) | Supprimer `lead-profiler.ts` (dead code) | S | ⬜ |
| [HIGH-05](HIGH-05-npm-audit-fix.md) | Corriger les 6 vulnérabilités npm | S | ⬜ |
| [HIGH-04](HIGH-04-analytics-setstate-effect.md) | Bug React setState dans useEffect | S | ⬜ |
| [MED-02](MED-02-env-example.md) | Créer `.env.example` | S | ⬜ |
| [MED-06](MED-06-fix-gitignore.md) | Corriger `.gitignore` | S | ⬜ |
| [MED-01](MED-01-real-readme.md) | Écrire un vrai README | S | ⬜ |
| [MED-04](MED-04-vercel-cron-config.md) | Créer `vercel.json` | S | ⬜ |
| [MED-03](MED-03-organize-orphan-scripts.md) | Organiser les scripts orphelins | S | ⬜ |
| [MED-07](MED-07-remove-or-protect-broadcast-test.md) | Supprimer `/api/broadcast/test` | S | ⬜ |
| [HIGH-12](HIGH-12-rate-limiting.md) | Rate limiting (Upstash) | M | ⬜ |
| [HIGH-01](HIGH-01-input-validation-zod.md) | Validation Zod sur 5 routes critiques | L | ⬜ |
| [HIGH-09](HIGH-09-consolidate-sql-migrations.md) | Consolider les migrations SQL | L | ⬜ |
| [HIGH-10](HIGH-10-add-test-suite.md) | Socle de tests Vitest | L | ⬜ |
| [MED-08](MED-08-ai-logs-retention.md) | Rétention ai_logs | S | ⬜ |

### 🟡 Phase 3 — Consolidation produit (Semaine 4+)

| ID | Titre | Effort | Statut |
|---|---|---|---|
| [HIGH-06](HIGH-06-llm-decision-gemini-vs-deepseek.md) | Décision LLM + fallback | M | ⬜ |
| [HIGH-07](HIGH-07-implement-or-drop-stt.md) | STT vocal : implémenter ou drop | L | ⬜ |
| [HIGH-08](HIGH-08-scraping-cron.md) | Scraping auto : cron ou drop | M | ⬜ |
| [HIGH-03](HIGH-03-fix-eslint-errors.md) | Nettoyer les 178 erreurs ESLint | M | ⬜ |
| [MED-05](MED-05-loading-error-states.md) | Loading/error states Next.js | M | ⬜ |
| [MED-13](MED-13-shadcn-ui-setup.md) | Setup shadcn/ui | M | ⬜ |
| [MED-15](MED-15-strict-typescript.md) | TypeScript strict | M | ⬜ |
| [MED-09](MED-09-rgpd-delete.md) | Droit à l'oubli RGPD | M | ⬜ |
| [MED-10](MED-10-document-kb-ingestion.md) | Documenter knowledge base | S | ⬜ |
| [MED-11](MED-11-normalize-table-names.md) | Normaliser noms de tables | L | ⬜ |
| [MED-12](MED-12-admin-client-wrapper.md) | Wrapper admin client | M | ⬜ |

### 🟢 Nettoyage continu

Voir [`LOW-SUMMARY.md`](LOW-SUMMARY.md) — tickets groupés, à traiter au fil de l'eau.

---

## Convention

- **S** = Small, ≤ 2h
- **M** = Medium, ≤ 1 jour
- **L** = Large, 1–5 jours

Chaque ticket contient :
- Contexte
- Fichiers concernés
- Étapes concrètes (souvent avec snippets)
- Critères d'acceptation
- Dépendances avec d'autres tickets

---

## Usage

Pour attaquer un ticket, copie son contenu dans une conversation Claude Code ou donne-le à un dev :
> Voici le ticket CRIT-01. Implémente les étapes 1-6, respecte les critères d'acceptation, teste localement.

Une fois fait, cocher la case ⬜ → ✅ dans la liste ci-dessus et committer.

# MED-11 — Normaliser les noms de tables Postgres

**Sévérité** : Moyenne
**Effort** : L (1–2 jours)

## Contexte

Les tables du projet ont des noms incohérents :
- `Profil_Prospects` (CamelCase + underscore — nécessite systématiquement des guillemets doubles)
- `Inscriptions`, `Smart_Segments`, `Inbox_Categories` (PascalCase — idem)
- `conversations`, `messages`, `programmes`, `broadcasts`, `ai_logs`, `knowledge_base` (snake_case — convention Postgres standard)
- `inscript_xxx` (dynamique, snake_case)
- `programme_champs`, `programme_schema`, `programme_colonnes` (préfixe `programme_`, snake_case)

Les tables PascalCase forcent l'usage de `"..."` partout, sources d'erreurs de saisie. Convention Postgres = snake_case (lowercase avec underscore).

## Étapes

### 1. Identifier toutes les tables

```sql
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
```

### 2. Plan de renommage

| Ancien | Nouveau |
|---|---|
| `Profil_Prospects` | `profils_prospects` |
| `Inscriptions` | `inscriptions` |
| `Smart_Segments` | `smart_segments` |
| `Inbox_Categories` | `inbox_categories` |

### 3. Migration SQL

```sql
-- 1. Renommer
ALTER TABLE "Profil_Prospects" RENAME TO profils_prospects;
ALTER TABLE "Inscriptions" RENAME TO inscriptions;
ALTER TABLE "Smart_Segments" RENAME TO smart_segments;
ALTER TABLE "Inbox_Categories" RENAME TO inbox_categories;

-- 2. Mettre à jour les foreign keys / triggers / vues / fonctions qui référencent les anciens noms
-- (à auditer au cas par cas)
```

### 4. Mettre à jour le code

Grep tout le code pour remplacer :
- `"Profil_Prospects"` / `from('Profil_Prospects')` → `profils_prospects`
- idem pour les 3 autres

Fichiers concernés (grep `Profil_Prospects`) :
- `lib/ai/rag-pipeline.ts`
- `lib/ai/context-enricher.ts`
- `lib/broadcast/sender.ts`
- `app/api/**/*.ts`
- `app/(dashboard)/**/page.tsx`
- Nombreux autres.

### 5. Stratégie de transition (zero-downtime)

Pour éviter un déploiement big-bang :
1. Créer des vues avec les anciens noms pointant vers les nouveaux :
   ```sql
   CREATE VIEW "Profil_Prospects" AS SELECT * FROM profils_prospects;
   ```
2. Déployer le nouveau code.
3. Supprimer les vues après vérification.

### 6. Régénérer les types Supabase

```bash
supabase gen types typescript --project-id <ref> > app/lib/database.types.ts
```

Et utiliser ces types pour remplacer les `any` progressivement.

## Critères d'acceptation

- Toutes les tables en snake_case.
- Plus aucune occurrence de `"Profil_Prospects"` dans le code.
- Build et tests passent.
- Zéro downtime grâce à la stratégie de vues temporaires.

## Dépendances

- HIGH-09 (consolidation migrations) — faire avant pour intégrer le renommage dans l'init.sql.

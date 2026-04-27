# MED-03 — Organiser les scripts orphelins

**Sévérité** : Moyenne
**Effort** : S (30 min)

## Contexte

À la racine d'`app/` :
- `test-context-enricher.ts`, `test-deepseek-tool.ts`, `test-dump.ts`, `test-telegram.js`, `test_schema.mjs` — scripts ad-hoc qui ressemblent à des tests mais n'en sont pas.
- `alter_table.mjs`, `migrate.js` — scripts d'administration DB.

Ces fichiers polluent l'arborescence et confondent un repreneur.

## Étapes

### 1. Inventaire

Pour chaque fichier, décider :
- **À supprimer** : script one-shot déjà exécuté, sans valeur future.
- **À archiver** : script potentiellement utile, à déplacer dans `app/scripts/legacy/`.
- **À migrer en test** : logique qui mérite d'être dans la suite de tests (après HIGH-10).

Suggestion :
| Fichier | Action proposée |
|---|---|
| `test-context-enricher.ts` | → `tests/context-enricher.test.ts` (adapter à vitest) |
| `test-deepseek-tool.ts` | → `scripts/legacy/` (exploration manuelle) |
| `test-dump.ts` | → supprimer si one-shot |
| `test-telegram.js` | → `scripts/legacy/` |
| `test_schema.mjs` | → supprimer (remplacé par Supabase CLI — voir HIGH-09) |
| `alter_table.mjs` | → `scripts/legacy/` avec README |
| `migrate.js` | → supprimer (remplacé par Supabase CLI) |

### 2. Créer `app/scripts/legacy/README.md`

Documenter brièvement ce que chaque script archivé fait, quand il a été utilisé.

### 3. Exécuter

```bash
cd app/
mkdir -p scripts/legacy
git mv test-deepseek-tool.ts scripts/legacy/
# etc.
git rm test-dump.ts  # si décidé de supprimer
```

## Critères d'acceptation

- Racine d'`app/` uniquement des fichiers de config (`package.json`, `tsconfig.json`, `next.config.mjs`, `eslint.config.mjs`, `middleware.ts`, etc.) + dossiers applicatifs.
- `scripts/legacy/` contient les scripts archivés avec un README explicatif.
- Les scripts vraiment morts sont supprimés.

## Dépendances

- Aucune.

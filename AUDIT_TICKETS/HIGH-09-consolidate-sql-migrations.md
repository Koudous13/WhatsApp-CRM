# HIGH-09 — Consolider les migrations SQL

**Sévérité** : Haute
**Effort** : L (1–2 jours)
**Finding parent** : `AUDIT.md` §3.HIGH-09

## Contexte

Le projet a **6 fichiers SQL de migration + 3 scripts `.mjs/.js`** sans ordre documenté, avec des conflits :

| Fichier | Rôle | État |
|---|---|---|
| `app/setup_v2.sql` | Programmes, stats_overrides | OK |
| `app/setup_v3_dynamic_tables.sql` | `admin_execute_sql`, programme_schema/colonnes | OK mais dangereux |
| `app/supabase_schema_update.sql` | `Inbox_Categories` (sans guillemets) | **Mojibake + doublon** |
| `app/MIGRATION_V2_INBOX.sql` | `Inbox_Categories` (avec guillemets), category_id | OK |
| `app/SQL_MIGRATION_INSCRIPTIONS.sql` | Table Inscriptions | OK |
| `app/SQL_MIGRATION_SMART_SEGMENTS.sql` | Table Smart_Segments | OK |

Problèmes :
- `Inbox_Categories` défini deux fois avec des guillemets différents → potentiellement 2 tables distinctes en base.
- Tables **non présentes dans les migrations** mais utilisées par le code : `Profil_Prospects`, `conversations`, `messages`, `broadcasts`, `ai_logs`, `knowledge_base`, `programme_champs`, `broadcast_sequences`, toutes les tables `inscript_*`. Créées via la console Supabase ou un script perdu.
- Pas de tracking des migrations appliquées.
- Impossible pour un nouveau dev de reconstruire la DB localement.

## Étapes

### 1. Dumper le schéma actuel de la prod

Via Supabase CLI ou psql :
```bash
supabase db dump --project-ref <ref> --schema public > current_schema.sql
# OU
pg_dump --schema-only --schema=public <connection-string> > current_schema.sql
```

Cela donne la source de vérité réelle.

### 2. Passer à la convention Supabase CLI

Installer Supabase CLI :
```bash
npm install -g supabase
cd app/
supabase init
supabase link --project-ref <ref>
```

Créer un dossier `supabase/migrations/` :
```
app/supabase/
├── config.toml
├── migrations/
│   ├── 20240101000000_init.sql          # = dump consolidé
│   ├── 20240201000000_add_stt_columns.sql   # futures migrations
│   └── ...
└── seed.sql
```

### 3. Créer `init.sql` consolidé

Fichier unique contenant :
- Extensions (`uuid-ossp`, `vector`)
- Toutes les tables (contacts, conversations, messages, broadcasts, ai_logs, knowledge_base, programmes, programme_champs, programme_schema, programme_colonnes, Inscriptions, Smart_Segments, Inbox_Categories, stats_overrides, admin_users)
- Les fonctions (`admin_execute_sql` — à sécuriser selon CRIT-04, `match_documents` pour pgvector, etc.)
- Les policies RLS (selon CRIT-03)
- Les indexes

### 4. Archiver les anciens fichiers

```bash
mkdir app/sql-archive
git mv app/setup_v2.sql app/sql-archive/
git mv app/setup_v3_dynamic_tables.sql app/sql-archive/
git mv app/supabase_schema_update.sql app/sql-archive/
git mv app/MIGRATION_V2_INBOX.sql app/sql-archive/
git mv app/SQL_MIGRATION_INSCRIPTIONS.sql app/sql-archive/
git mv app/SQL_MIGRATION_SMART_SEGMENTS.sql app/sql-archive/
echo "# Archive des migrations pré-consolidation — ne pas exécuter" > app/sql-archive/README.md
```

### 5. Vérifier les scripts `.mjs/.js`

- `app/migrate.js` : si encore utilisé, migrer vers `supabase db push` ou documenter.
- `app/alter_table.mjs` : ad-hoc, archiver.
- `app/scripts/init_schema.mjs` : remplacé par Supabase CLI.

### 6. Documenter le workflow dans `README.md`

```md
## Base de données

- Source de vérité : `app/supabase/migrations/`
- Nouvelle migration : `cd app && supabase migration new <name>`
- Push en prod : `supabase db push`
- Reset local : `supabase db reset`
```

### 7. Résoudre le conflit `Inbox_Categories`

En se connectant à la prod :
```sql
SELECT table_name, column_name FROM information_schema.columns
WHERE table_name ILIKE 'Inbox_Categories%';
```

Identifier laquelle existe réellement. Garder celle avec guillemets (`"Inbox_Categories"`) car c'est ce que le code utilise. Dropper l'autre si elle existe.

## Critères d'acceptation

- Un `git clone` + `cd app && supabase db reset` recrée la DB complète.
- Un seul `Inbox_Categories` en base (guillemets = canonique).
- Les anciens fichiers SQL sont dans `app/sql-archive/` avec un README.
- Les futures migrations suivent la convention Supabase CLI.
- `app/README.md` documente le workflow.

## Dépendances

- CRIT-03 et CRIT-04 modifient les policies et fonctions — intégrer leurs changements dans `init.sql`.

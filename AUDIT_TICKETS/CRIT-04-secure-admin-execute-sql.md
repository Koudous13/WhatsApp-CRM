# CRIT-04 — Verrouiller la fonction `admin_execute_sql`

**Sévérité** : Critique
**Effort** : M (4h)
**Finding parent** : `AUDIT.md` §3.CRIT-04

## Contexte

La fonction PostgreSQL `admin_execute_sql(text)` est définie en `SECURITY DEFINER`, ce qui signifie qu'elle s'exécute avec les droits du propriétaire (probablement `postgres`, donc superuser sur Supabase). Elle accepte une chaîne SQL arbitraire et l'exécute.

Le commentaire dans le SQL dit « ne doit être appelée QUE par le serveur Next.js avec la clé SERVICE_ROLE » mais rien dans la définition Postgres ne l'empêche. Si les privilèges GRANT sont laissés par défaut, la fonction est appelable par le rôle `anon` et `authenticated`, donc depuis le navigateur avec la clé publique.

Elle est utilisée dans **16 endroits** du code, y compris dans le pipeline RAG et le context-enricher (inputs indirectement utilisateur).

## Fichiers concernés

- `app/setup_v3_dynamic_tables.sql:12-17` (définition)
- 16 appelants listés dans `AUDIT.md`, notamment :
  - `app/app/api/programmes/route.ts:114, 180`
  - `app/app/api/programmes/[id]/route.ts:57`
  - `app/app/api/setup/programmes/route.ts:36`
  - `app/app/api/settings/prompt/route.ts:23`
  - `app/app/api/maintenance/*/route.ts`
  - `app/app/api/inscriptions/[slug]/bulk/route.ts:84`
  - `app/lib/ai/context-enricher.ts:68, 97`
  - `app/lib/ai/rag-pipeline.ts:260, 318, 339, 355`

## Stratégie

Approche en 3 temps :

1. **Immédiat** : révoquer tous les GRANTs sauf `service_role`.
2. **Court terme** : remplacer les usages bénins par du SDK Supabase standard.
3. **Long terme** : remplacer la fonction par des fonctions Postgres typées et limitées.

## Étapes

### 1. Révoquer les GRANTs (à faire AVANT tout le reste)

```sql
-- Vérifier qui peut exécuter
SELECT routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_name = 'admin_execute_sql';

-- Révoquer systématiquement
REVOKE ALL ON FUNCTION public.admin_execute_sql(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_execute_sql(text) FROM anon;
REVOKE ALL ON FUNCTION public.admin_execute_sql(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_execute_sql(text) TO service_role;
```

### 2. Remplacer les appels bénins par du SDK Supabase

**Cas faciles à refactorer** :

- `lib/ai/context-enricher.ts:62-76` (listInscriptionTables) : remplacer par une requête sur `programme_schema.table_name`.
- `lib/ai/context-enricher.ts:81-107` (fetchInscriptions) : itérer en TypeScript avec `supabase.from(table).select()` pour chaque table.
- `app/api/maintenance/sync-contacts/route.ts` : déjà utilise l'ORM, pas de changement nécessaire.

**Cas plus difficiles (DDL dynamique)** :

- `app/api/programmes/route.ts:114` (CREATE TABLE dynamique) : garder via `admin_execute_sql` mais valider très strictement le SQL généré. Alternative : fonction Postgres typée `admin_create_program_table(slug text, columns jsonb)` qui construit le DDL en interne.
- `app/api/programmes/route.ts:180` (bulk INSERT) : remplacer par `supabase.from(tableName).insert(rows)` — possible si le cache PostgREST est rafraîchi après la création de table (voir la fonction RPC `supabase.rpc('pg_notify', { channel: 'pgrst', payload: 'reload schema' })`).

### 3. Remplacer par fonctions typées (long terme)

Créer une suite de fonctions Postgres limitées :

```sql
CREATE OR REPLACE FUNCTION admin_create_program_table(
    p_slug text,
    p_columns jsonb  -- [{"name": "prenom", "type": "TEXT"}, ...]
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    safe_slug text;
    table_name text;
    col_def text;
    col_sql text := '';
BEGIN
    -- Validation stricte du slug
    IF p_slug !~ '^[a-z][a-z0-9_]{0,30}$' THEN
        RAISE EXCEPTION 'Invalid slug: %', p_slug;
    END IF;
    safe_slug := p_slug;
    table_name := 'inscript_' || safe_slug;

    -- Construction sécurisée des colonnes
    FOR col_def IN SELECT jsonb_array_elements(p_columns)
    LOOP
        -- Valider nom + type
        IF (col_def->>'name') !~ '^[a-z][a-z0-9_]{0,30}$' THEN
            RAISE EXCEPTION 'Invalid column name';
        END IF;
        IF (col_def->>'type') NOT IN ('TEXT', 'NUMERIC', 'INTEGER', 'BOOLEAN', 'DATE') THEN
            RAISE EXCEPTION 'Invalid column type';
        END IF;
        col_sql := col_sql || format(', %I %s', col_def->>'name', col_def->>'type');
    END LOOP;

    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), chat_id TEXT UNIQUE NOT NULL, status TEXT DEFAULT ''pending'', created_at TIMESTAMPTZ DEFAULT now()%s)',
        table_name,
        col_sql
    );
END;
$$;

REVOKE ALL ON FUNCTION admin_create_program_table(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_create_program_table(text, jsonb) TO service_role;
```

Une fois les fonctions typées en place, supprimer `admin_execute_sql`.

## Critères d'acceptation

- `SELECT has_function_privilege('anon', 'admin_execute_sql(text)', 'EXECUTE');` retourne `false`.
- `SELECT has_function_privilege('authenticated', 'admin_execute_sql(text)', 'EXECUTE');` retourne `false`.
- `SELECT has_function_privilege('service_role', 'admin_execute_sql(text)', 'EXECUTE');` retourne `true`.
- Les fonctionnalités qui dépendent de `admin_execute_sql` continuent de fonctionner depuis le serveur Next.js (qui utilise `service_role`).
- (Long terme) le projet n'appelle plus `admin_execute_sql` directement.

## Dépendances

- À faire AVANT CRIT-03, car RLS repose sur la confiance que seul `service_role` peut contourner le schéma.
- À faire en même temps que CRIT-05 (la protection `admin_execute_sql` change aussi le risque d'injection SQL).

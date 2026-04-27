# CRIT-05 — Injection SQL potentielle via `/api/programmes` (POST)

**Sévérité** : Critique
**Effort** : M (3h avec tests)
**Finding parent** : `AUDIT.md` §3.CRIT-05

## Contexte

La route `POST /api/programmes` construit deux requêtes SQL par concaténation de strings et les envoie à `admin_execute_sql` :
- Un `CREATE TABLE` avec colonnes dynamiques (ligne 105-112).
- Un `INSERT ... VALUES ... ON CONFLICT ... DO UPDATE` avec valeurs dynamiques (ligne 173-178).

La protection actuelle :
- `slug.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase()` pour le nom de table.
- `f.name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()` pour les noms de colonnes.
- `val.replace(/'/g, "''")` pour les valeurs string.

Failles :
- Les noms de colonnes sont entourés de guillemets doubles (`"${col}"`) mais jamais échappés. Si un attaquant contrôle `allColumns` via des clés JSON, il peut injecter `"; DROP TABLE ... --`.
- `allColumns` vient de `Object.keys(row)` où `row` vient du CSV uploadé ET du mapping des `fields`. Une clé JSON `"; DROP...` passe le filtre actuel car `headerMapping[originalKey] || originalKey.replace(/[^a-zA-Z0-9_]/g, '_')` — le fallback est OK mais `headerMapping` peut être n'importe quoi si non contrôlé.
- `columnsSql = allColumns.map(c => \`"${c}"\`).join(', ')` — aucun check.

Combiné à CRIT-02 (route non protégée), c'est une vulnérabilité exploitable par un inconnu sur internet.

## Fichiers concernés

- `app/app/api/programmes/route.ts:84-88, 100, 157-180` (POST)
- `app/app/api/programmes/route.ts:25` (GET — construction tableName OK ici, juste nettoyage)
- `app/app/api/inscriptions/[slug]/bulk/route.ts:77-84` (même pattern à vérifier)
- `app/app/api/setup/programmes/route.ts:36`
- `app/app/api/messages/handover/route.ts` (à vérifier)

## Étapes

### 1. Remplacer le bulk INSERT par le SDK Supabase

Le commentaire du code actuel explique : "Conversion des lignes en SQL INSERT pour contourner le cache PostgREST (Schema Cache)". C'est un hack car la table vient d'être créée et PostgREST n'a pas encore vu son schéma.

**Solution propre** : forcer PostgREST à recharger son schéma avant l'INSERT, puis utiliser le SDK.

```ts
// Après admin_execute_sql avec CREATE TABLE
await supabase.rpc('notify_pgrst_reload')  // nécessite fonction Postgres ci-dessous
await new Promise(r => setTimeout(r, 500))  // laisser le temps au rechargement

// Puis INSERT propre
const { error: insertError } = await supabase
    .from(tableName as any)
    .upsert(rowsToInsert, { onConflict: 'chat_id' })
```

Fonction Postgres à créer :
```sql
CREATE OR REPLACE FUNCTION notify_pgrst_reload() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$ BEGIN NOTIFY pgrst, 'reload schema'; END $$;
REVOKE ALL ON FUNCTION notify_pgrst_reload() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION notify_pgrst_reload() TO service_role;
```

### 2. Valider strictement les noms de colonnes

Même si CRIT-04 verrouille `admin_execute_sql` au service_role, on veut une défense en profondeur :

```ts
const COLUMN_NAME_REGEX = /^[a-z][a-z0-9_]{0,40}$/

function assertSafeColumnName(name: string) {
    if (!COLUMN_NAME_REGEX.test(name)) {
        throw new Error(`Invalid column name: ${name}`)
    }
}

// Avant construction SQL
allColumns.forEach(assertSafeColumnName)
```

### 3. Valider strictement le slug

```ts
const SLUG_REGEX = /^[a-z][a-z0-9_]{0,30}$/

if (!SLUG_REGEX.test(slug)) {
    return NextResponse.json({ error: 'Slug invalide' }, { status: 400 })
}
```

### 4. Idem pour `/api/inscriptions/[slug]/bulk/route.ts`

Appliquer les mêmes checks et refactor.

## Critères d'acceptation

- Envoyer `POST /api/programmes` avec `slug: "x\"; DROP TABLE users; --"` retourne 400.
- Envoyer un `field.name` malicieux retourne 400.
- Un flow normal (slug + fields + initialData CSV) fonctionne et insère les données correctement.
- Plus aucun appel à `admin_execute_sql` pour des INSERTs classiques.

## Dépendances

- Fait en même temps que CRIT-04 (les deux réduisent le blast radius mutuellement).
- Fait après CRIT-02 (sinon la route reste ouverte).

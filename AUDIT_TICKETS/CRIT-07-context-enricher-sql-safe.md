# CRIT-07 — `admin_execute_sql` atteignable via contenu utilisateur dans context-enricher

**Sévérité** : Critique
**Effort** : S (1–2h)
**Finding parent** : `AUDIT.md` §3.CRIT-07

## Contexte

La fonction `fetchInscriptions` dans `context-enricher.ts` construit un `UNION ALL` SQL qui inclut le `chat_id` (qui vient du webhook WhatsApp, donc est externe et potentiellement hostile) :

```ts
const safeChat = chatId.replace(/'/g, "''")
const unionSql = tables.map(t => {
    const safeTable = t.replace(/[^a-zA-Z0-9_]/g, '')
    const slug = safeTable.replace(/^inscript_/, '')
    return `SELECT '${slug}' AS slug, status FROM "${safeTable}" WHERE chat_id = '${safeChat}'`
}).join(' UNION ALL ')
const { data, error } = await supabase.rpc('admin_execute_sql', { sql_query: unionSql })
```

Le `chat_id` est extrait d'un header WhatsApp, donc contrôlable par un attaquant (via un message forgé si le webhook était ouvert — voir CRIT-01). Même une fois CRIT-01 corrigé, la défense en profondeur exige qu'aucune donnée externe ne soit concaténée dans du SQL exécuté en `SECURITY DEFINER`.

L'escapement `.replace(/'/g, "''")` protège contre les single quotes basiques mais n'est pas une garantie définitive (ex : caractères unicode exotiques, null bytes).

## Fichiers concernés

- `app/lib/ai/context-enricher.ts:88-97` (fetchInscriptions)
- `app/lib/ai/context-enricher.ts:62-76` (listInscriptionTables — plus bénin car SQL statique)

## Étapes

### 1. Remplacer par une itération avec le SDK Supabase

```ts
async function fetchInscriptions(
    supabase: SupabaseClient,
    chatId: string,
    tables: string[]
): Promise<InscriptionEntry[]> {
    if (tables.length === 0) return []

    const results = await Promise.all(
        tables.map(async (t) => {
            const safeTable = t.replace(/[^a-zA-Z0-9_]/g, '')
            if (!safeTable || !safeTable.startsWith('inscript_')) return null
            const slug = safeTable.replace(/^inscript_/, '')

            try {
                const { data, error } = await supabase
                    .from(safeTable as any)
                    .select('status')
                    .eq('chat_id', chatId)
                    .maybeSingle()

                if (error || !data) return null
                return { slug, status: data.status ?? 'unknown' }
            } catch {
                return null
            }
        })
    )

    return results.filter((r): r is InscriptionEntry => r !== null)
}
```

### 2. Remplacer `listInscriptionTables` également

Plutôt que de passer par `admin_execute_sql` pour lire `information_schema`, utiliser la table `programme_schema` qui maintient déjà le mapping :

```ts
async function listInscriptionTables(supabase: SupabaseClient): Promise<string[]> {
    const { data, error } = await supabase
        .from('programme_schema')
        .select('table_name')

    if (error || !data) return []
    return data
        .map((r: any) => r.table_name)
        .filter((t: string) => t && /^inscript_[a-z0-9_]+$/.test(t))
}
```

### 3. Auditer les autres usages de `admin_execute_sql` dans `lib/ai/`

`rag-pipeline.ts:260, 318, 339, 355` — appliquer le même principe : passer par le SDK quand possible, sinon valider strictement.

## Critères d'acceptation

- `context-enricher.ts` n'appelle plus `admin_execute_sql`.
- Un test unitaire avec `chatId = "'; DROP TABLE users; --"` ne crash pas et retourne `[]`.
- Le enrichissement de contexte fonctionne toujours sur les utilisateurs normaux.
- Performance équivalente ou meilleure (Promise.all en parallèle au lieu d'un UNION).

## Dépendances

- Aucune. Peut se faire indépendamment.
- Simplifie CRIT-04 (moins d'appelants de `admin_execute_sql`).

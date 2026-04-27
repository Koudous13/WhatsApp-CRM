# MED-12 — Wrapper pour `createAdminClient` avec traçabilité

**Sévérité** : Moyenne
**Effort** : M (3h)

## Contexte

`createAdminClient()` (dans `lib/supabase/server.ts`) crée un client Supabase avec la `service_role` key, qui contourne RLS. Il est utilisé dans **37 fichiers** (cf. grep de l'audit).

Problèmes :
- Difficile de savoir qui utilise le bypass RLS.
- En cas d'incident de sécurité, impossible de tracer quels endpoints ont été touchés.
- Encourage le "tout en admin" au lieu du moindre privilège.

## Étapes

### 1. Remplacer `createAdminClient` par un wrapper loggué

```ts
// lib/supabase/server.ts

export function createAdminClient(caller?: string) {
    if (process.env.NODE_ENV !== 'production') {
        console.log(`[supabase:admin] created by ${caller ?? 'unknown'}`)
    }

    // Optionnel : envoyer une metric à un monitoring
    // metric.increment('supabase.admin_client.created', { caller })

    return createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    )
}
```

### 2. Passer systématiquement l'appelant

```ts
// Avant
const supabase = createAdminClient()

// Après
const supabase = createAdminClient('webhooks.wasender.POST')
```

(Pour toutes les 37 occurrences — effort volumétrique.)

### 3. Linter custom qui refuse l'appel sans argument

Créer une règle ESLint custom ou un `ast-grep` qui flag les usages nus.

### 4. Alternative : créer des fonctions spécialisées

```ts
// lib/supabase/admin-ops.ts
import { createAdminClient } from './server'

export async function markMessageDelivered(messageId: string, status: string) {
    const supabase = createAdminClient('admin-ops.markMessageDelivered')
    return supabase.from('messages').update({ delivery_status: status }).eq('wasender_message_id', messageId)
}
```

Cela réduit la surface d'appel direct à `createAdminClient` et documente les opérations.

### 5. Identifier les cas où `createClient()` suffirait

Certains usages actuels n'ont pas besoin de bypass RLS (ex : si RLS admin est en place après CRIT-03, une simple session auth admin suffit). Remplacer `createAdminClient` par `createClient` dans ces cas.

## Critères d'acceptation

- Tous les appels à `createAdminClient` ont un argument `caller`.
- Un log de création est émis en dev.
- Au moins 5 routes ont été migrées de `createAdminClient` à `createClient` (défense en profondeur).

## Dépendances

- CRIT-03 (RLS correctes) nécessaire avant de migrer vers `createClient`.

# CRIT-02 — Protéger toutes les routes API

**Sévérité** : Critique
**Effort** : M (3–4h)
**Finding parent** : `AUDIT.md` §3.CRIT-02

## Contexte

Le middleware Next.js ignore complètement les routes `/api/*`, et aucune route (sauf `/api/broadcast/tick` qui vérifie `CRON_SECRET`) ne vérifie l'authentification elle-même. Un inconnu peut créer des broadcasts, altérer le prompt IA, exécuter `admin_execute_sql` via `/api/programmes`, etc. Les URLs de déploiement Vercel sont énumérables.

## Fichiers concernés

- `app/middleware.ts`
- Tous les fichiers `app/app/api/**/route.ts` (40+)

## Stratégie

Double défense :
1. **Middleware** qui protège `/api/*` par défaut, avec une whitelist pour les routes publiques légitimes.
2. **Vérification dans chaque route sensible** (ceinture + bretelles) via `supabase.auth.getUser()`.

## Routes à laisser publiques (whitelist)

- `/api/webhooks/wasender` — validation HMAC (voir CRIT-01)
- `/api/auth/callback` — callback OAuth Supabase
- `/api/broadcast/tick` — vérifie déjà `Bearer CRON_SECRET`
- Éventuellement `/api/inscription/create` si le formulaire d'inscription public l'utilise (à vérifier)

Toutes les autres doivent être derrière auth.

## Étapes

### 1. Modifier `middleware.ts`

```ts
const API_PUBLIC = [
    '/api/webhooks/wasender',
    '/api/auth/callback',
    '/api/broadcast/tick',
]

const PROTECTED_PATHS = ['/inbox', '/contacts', '/analytics', '/broadcast', '/knowledge', '/programmes', '/settings']

export async function middleware(req: NextRequest) {
    const res = NextResponse.next()
    const pathname = req.nextUrl.pathname

    if (pathname.startsWith('/_next')) return res

    const isApiPublic = API_PUBLIC.some(p => pathname.startsWith(p))
    if (isApiPublic) return res

    const isApi = pathname.startsWith('/api')
    const isProtectedPage = PROTECTED_PATHS.some(p => pathname.startsWith(p))

    if (!isApi && !isProtectedPage) return res

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll: () => req.cookies.getAll(),
                setAll: (cookiesToSet) => cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options)),
            },
        }
    )

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        if (isApi) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        return NextResponse.redirect(new URL('/login', req.url))
    }

    return res
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

### 2. Défense en profondeur : vérifier dans chaque handler sensible

Créer un helper `lib/auth/require-user.ts` :

```ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function requireUser() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { user: null, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    }
    return { user, response: null }
}
```

Appliquer au début de chaque route sensible :

```ts
export async function POST(req: NextRequest) {
    const { user, response } = await requireUser()
    if (response) return response
    // ... suite
}
```

### 3. Routes à modifier (prioritaires)

Toutes sauf la whitelist ci-dessus. En priorité :
- `/api/messages/send` — évite le spam via ton numéro WhatsApp
- `/api/broadcast/create`, `/api/broadcast/delete`, `/api/broadcast/test`
- `/api/broadcast/sequence/*`
- `/api/programmes`, `/api/programmes/[id]`
- `/api/setup/programmes`
- `/api/inscription*`, `/api/inscriptions/*`
- `/api/knowledge/*`
- `/api/maintenance/*` (celles-ci pourraient même nécessiter un rôle admin)
- `/api/settings/prompt`
- `/api/analytics/*`
- `/api/messages/handover`

## Critères d'acceptation

- `curl -X POST https://.../api/broadcast/create -d '{}'` retourne 401.
- Le même appel depuis le dashboard (utilisateur connecté) fonctionne.
- `curl -X POST https://.../api/webhooks/wasender ...` (avec HMAC valide) fonctionne.
- `curl -H "Authorization: Bearer $CRON_SECRET" https://.../api/broadcast/tick` fonctionne.
- Le dashboard continue à charger toutes les données après connexion.

## Dépendances

- Idéalement fait après CRIT-01 (webhook) et en même temps que CRIT-04 (verrouillage `admin_execute_sql`).

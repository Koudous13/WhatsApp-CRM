# HIGH-12 — Rate limiting applicatif

**Sévérité** : Haute
**Effort** : M (1 jour)
**Finding parent** : `AUDIT.md` §3.HIGH-12

## Contexte

Aucune des routes API n'implémente de rate limit. Un attaquant peut :
- Spammer `/api/messages/send` → épuiser ton quota WaSenderAPI + risque de ban WhatsApp.
- Spammer `/api/broadcast/create` → cramer le budget DeepSeek et WaSenderAPI.
- Spammer le webhook (même avec HMAC) si le secret fuite.

Il existe un rate limit implicite dans `lib/broadcast/sender.ts` (6s + jitter entre messages), mais c'est au niveau broadcast, pas globalement.

## Options

### Option A — Upstash Redis + `@upstash/ratelimit` (recommandé)

Serverless, intégré Vercel, 10k requêtes gratuites / jour.

### Option B — Vercel natif

Edge Middleware avec un Map en mémoire (non persistant entre instances). Utile pour du rate limit "best effort".

## Étapes (Option A)

### 1. Créer un projet Upstash Redis

Via Vercel Integration Marketplace : 1 clic.

Variables ajoutées automatiquement : `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.

### 2. Installer

```bash
cd app/
npm install @upstash/ratelimit @upstash/redis
```

### 3. Créer le helper

```ts
// lib/rate-limit.ts
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { NextResponse } from 'next/server'

const redis = Redis.fromEnv()

export const rateLimiters = {
    webhook: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(120, '1 m'),  // 120 messages/min par phone
        prefix: 'rl:webhook',
    }),
    send: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(30, '1 m'),
        prefix: 'rl:send',
    }),
    broadcast: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(5, '1 h'),  // 5 broadcasts/heure
        prefix: 'rl:broadcast',
    }),
}

export async function checkRateLimit(limiter: Ratelimit, identifier: string) {
    const { success, limit, remaining, reset } = await limiter.limit(identifier)
    if (!success) {
        return NextResponse.json(
            { error: 'Rate limit exceeded' },
            {
                status: 429,
                headers: {
                    'X-RateLimit-Limit': String(limit),
                    'X-RateLimit-Remaining': String(remaining),
                    'X-RateLimit-Reset': String(reset),
                },
            }
        )
    }
    return null
}
```

### 4. Appliquer

Webhook (par chat_id) :
```ts
const rlResponse = await checkRateLimit(rateLimiters.webhook, from)
if (rlResponse) return rlResponse
```

`/api/messages/send` (par user Supabase) :
```ts
const { user, response } = await requireUser()
if (response) return response
const rlResponse = await checkRateLimit(rateLimiters.send, user.id)
if (rlResponse) return rlResponse
```

`/api/broadcast/create` (par user) :
```ts
const rlResponse = await checkRateLimit(rateLimiters.broadcast, user.id)
if (rlResponse) return rlResponse
```

### 5. Tester

```bash
for i in {1..10}; do
    curl -X POST https://.../api/messages/send -H "Cookie: ..." -d '{"to":"229...","text":"hi","conversationId":"..."}' &
done
# Après le 6e, on doit voir des 429.
```

## Critères d'acceptation

- Upstash Redis configuré et accessible.
- Webhook limite à 120 messages/min par chat_id.
- `/api/messages/send` limite à 30/min par user.
- `/api/broadcast/create` limite à 5/h par user.
- Les headers `X-RateLimit-*` sont retournés.
- Un dépassement retourne 429 clairement.

## Dépendances

- CRIT-02 (auth) recommandé avant, sinon on rate-limite par IP (moins pertinent).

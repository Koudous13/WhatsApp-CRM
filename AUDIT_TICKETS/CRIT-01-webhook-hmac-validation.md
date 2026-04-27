# CRIT-01 — Webhook WaSenderAPI sans validation HMAC effective

**Sévérité** : Critique
**Effort** : S (30 min)
**Finding parent** : `AUDIT.md` §3.CRIT-01

## Contexte

Le webhook qui reçoit les messages WhatsApp depuis WaSenderAPI n'authentifie pas les requêtes entrantes. La fonction `validateHmac` est écrite mais jamais invoquée. N'importe qui connaissant l'URL du webhook (elle est publique car hébergée sur Vercel) peut injecter des messages fictifs dans la base, forger des opt-out, ou déclencher des réponses IA qui coûtent en tokens DeepSeek.

## Fichiers concernés

- `app/app/api/webhooks/wasender/route.ts` (lignes 9-32, 41-42)

## État actuel

```ts
function validateHmac(body: string, signature: string): boolean {
    const secret = process.env.WASENDER_WEBHOOK_SECRET
    if (!secret || !signature) return false
    const expected = createHmac('sha256', secret).update(body).digest('hex')
    return signature.toLowerCase() === expected.toLowerCase()
}

export async function POST(req: NextRequest) {
    const rawBody = await req.text()
    // ...pas d'appel à validateHmac...
    const signature = req.headers.get('x-webhook-signature') ?? req.headers.get('x-wasender-signature') ?? ''
    // signature lue puis ignorée
}
```

## Étapes

1. Appeler `validateHmac(rawBody, signature)` immédiatement après la lecture de `signature`, avant toute opération DB.
2. Remplacer la comparaison `toLowerCase() ===` par `crypto.timingSafeEqual` pour éviter les timing attacks.
3. Retourner `401` si la validation échoue.
4. Ajouter une tolérance de replay : lire un timestamp (header `x-webhook-timestamp` si WaSenderAPI l'expose, sinon refuser les corps sans timestamp).
5. Retirer les commentaires "AUCUNE VERIFICATION STRICTE D'EVENT ICI POUR DEBUG" ligne 41 et restaurer la validation stricte des events.
6. Vérifier que `WASENDER_WEBHOOK_SECRET` est bien configuré dans Vercel (`vercel env ls`).

## Snippet proposé

```ts
import { createHmac, timingSafeEqual } from 'crypto'

function validateHmac(body: string, signature: string): boolean {
    const secret = process.env.WASENDER_WEBHOOK_SECRET
    if (!secret || !signature) return false
    const expected = createHmac('sha256', secret).update(body).digest('hex')
    const a = Buffer.from(expected, 'hex')
    const b = Buffer.from(signature.toLowerCase(), 'hex')
    if (a.length !== b.length) return false
    try { return timingSafeEqual(a, b) } catch { return false }
}

export async function POST(req: NextRequest) {
    const rawBody = await req.text()
    const signature = req.headers.get('x-webhook-signature') ?? req.headers.get('x-wasender-signature') ?? ''

    if (!validateHmac(rawBody, signature)) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    // ... suite du handler
}
```

## Critères d'acceptation

- Un POST sans header `x-webhook-signature` reçoit 401.
- Un POST avec un mauvais secret reçoit 401.
- Un POST valide est traité comme avant.
- Le commentaire "DEBUG" ligne 41 est retiré et la validation des events est rétablie.
- Test manuel : `curl -X POST https://.../api/webhooks/wasender -d '{"event":"test"}'` retourne 401.

## Dépendances

- Aucune avant. CRIT-06 (retrait debug logging) doit idéalement être fait en même temps puisqu'il touche le même fichier.

# HIGH-01 — Validation des inputs avec Zod

**Sévérité** : Haute
**Effort** : L (1 semaine pour couvrir toutes les routes)
**Finding parent** : `AUDIT.md` §3.HIGH-01

## Contexte

Aucune des 40+ routes API du projet ne valide son input en runtime. Toutes font `await req.json()` et accèdent aux champs sans typer ni vérifier. Résultat :
- 44 occurrences de `: any` dans les routes API (`grep -c ': any' app/app/api/**/*.ts`).
- Bugs silencieux quand un client envoie un champ manquant ou de mauvais type.
- Risque : un champ texte inattendu injecté dans un prompt IA, ou dans une construction SQL, ou dans une boucle `Object.entries`.

## Fichiers concernés

Toutes les routes `app/app/api/**/route.ts`. Priorité aux 5 les plus sensibles :
1. `app/app/api/webhooks/wasender/route.ts`
2. `app/app/api/broadcast/create/route.ts`
3. `app/app/api/programmes/route.ts`
4. `app/app/api/messages/send/route.ts`
5. `app/app/api/settings/prompt/route.ts`

## Étapes

### 1. Installer Zod

```bash
cd app/
npm install zod
```

### 2. Créer un dossier `lib/schemas/`

Un fichier par domaine :

```ts
// lib/schemas/broadcast.ts
import { z } from 'zod'

export const VariantSchema = z.object({
    id: z.string().min(1),
    body: z.string().min(1).max(4000),
    ratio: z.number().int().min(0).max(100),
})

export const CreateBroadcastSchema = z.object({
    name: z.string().min(1).max(100),
    variants: z.array(VariantSchema).min(1),
    filterProgramme: z.union([z.string(), z.array(z.string())]).optional(),
    filterOptIn: z.boolean().optional(),
    csvData: z.array(z.record(z.string(), z.unknown())).optional(),
    scheduledAt: z.string().datetime().optional().nullable(),
    selectedSegmentId: z.string().uuid().optional().nullable(),
    segmentFilters: z.object({
        programmes: z.array(z.string()),
        statuts: z.array(z.string()),
        scoreMin: z.number().int().min(0).max(100),
        scoreMax: z.number().int().min(0).max(100),
    }).optional(),
})

export type CreateBroadcastInput = z.infer<typeof CreateBroadcastSchema>
```

### 3. Créer un helper de parsing

```ts
// lib/schemas/parse.ts
import { NextResponse } from 'next/server'
import type { ZodSchema, z } from 'zod'

export async function parseBody<T extends ZodSchema>(
    req: Request,
    schema: T
): Promise<{ data: z.infer<T>; response: null } | { data: null; response: Response }> {
    let raw: unknown
    try { raw = await req.json() } catch {
        return { data: null, response: NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
    }
    const result = schema.safeParse(raw)
    if (!result.success) {
        return {
            data: null,
            response: NextResponse.json(
                { error: 'Invalid input', details: result.error.flatten() },
                { status: 400 }
            ),
        }
    }
    return { data: result.data, response: null }
}
```

### 4. Appliquer dans chaque route

```ts
// app/api/broadcast/create/route.ts
import { CreateBroadcastSchema } from '@/lib/schemas/broadcast'
import { parseBody } from '@/lib/schemas/parse'

export async function POST(req: NextRequest) {
    const { data, response } = await parseBody(req, CreateBroadcastSchema)
    if (response) return response

    // data est typé précisément, plus de `any`
    const { name, variants, filterProgramme, ... } = data
    // ...
}
```

### 5. Schémas à créer pour les 5 routes prioritaires

| Route | Schéma |
|---|---|
| `webhooks/wasender` | `WaSenderEventSchema` (union des types d'events) |
| `broadcast/create` | `CreateBroadcastSchema` (ci-dessus) |
| `programmes` POST | `CreateProgrammeSchema` (nom, slug, fields[], initialData[]) |
| `messages/send` | `SendMessageSchema` (to, text, conversationId) |
| `settings/prompt` POST | `UpdatePromptSchema` (content) |

### 6. Propager progressivement aux autres routes

Ordre suggéré : routes qui prennent du texte libre (knowledge, inscription, programme), puis les routes plus simples.

## Critères d'acceptation

- `zod` est en dépendance.
- Les 5 routes prioritaires utilisent un schéma Zod.
- Un POST avec un body malformé sur ces 5 routes retourne 400 avec un message d'erreur clair.
- Un POST valide fonctionne comme avant.
- Les `any` disparaissent progressivement des routes protégées.

## Dépendances

- Peut se faire indépendamment. Idéal de le grouper avec CRIT-02 (auth) dans un "hardening sprint".

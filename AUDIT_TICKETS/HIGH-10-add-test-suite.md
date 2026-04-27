# HIGH-10 — Ajouter un socle de tests automatisés

**Sévérité** : Haute
**Effort** : L (3–5 jours pour un socle, puis maintenance continue)
**Finding parent** : `AUDIT.md` §3.HIGH-10

## Contexte

Le projet n'a **aucun test automatisé** : pas de `vitest`, `jest`, `playwright`, ni aucun runner dans `package.json`. Les fichiers `test-*.ts` à la racine d'`app/` sont des scripts ad-hoc.

Conséquence : toute modification = risque de régression non détecté. Impossible de faire confiance à un PR sans tester manuellement toutes les features.

## Priorités

1. **Tests unitaires** sur les fonctions pures / déterministes (facile, rentable).
2. **Tests d'intégration** sur les routes API critiques (moyen).
3. **Tests E2E** via Playwright sur les parcours dashboard (long terme).

## Étapes

### 1. Installer Vitest

```bash
cd app/
npm install -D vitest @vitest/ui
```

Ajouter au `package.json` :
```json
"scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:ui": "vitest --ui"
}
```

### 2. Config `vitest.config.ts`

```ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
    test: {
        environment: 'node',
        globals: true,
    },
    resolve: {
        alias: { '@': path.resolve(__dirname, '.') }
    }
})
```

### 3. Premiers tests — fonctions pures

```ts
// lib/ai/__tests__/context-enricher.test.ts
import { describe, it, expect } from 'vitest'
import { detectKeywords, decideRoute } from '../context-enricher'

describe('detectKeywords', () => {
    it('détecte une demande humain', () => {
        expect(detectKeywords('Je veux parler à un humain')).toContain('demande_humain')
    })
    it('détecte une validation de paiement', () => {
        expect(detectKeywords("J'ai payé hier")).toContain('validation_offline')
    })
    it('ne détecte rien sur un message neutre', () => {
        expect(detectKeywords('Bonjour')).toEqual([])
    })
})

describe('decideRoute', () => {
    it('DEMANDE_HUMAIN prime sur tout', () => {
        expect(decideRoute({
            hasProfil: true, hasPrenom: true, hasActiveInscription: true,
            hasAnyInscription: true, signals: ['demande_humain']
        })).toBe('DEMANDE_HUMAIN')
    })
    it('NOUVEAU_PROSPECT par défaut', () => {
        expect(decideRoute({
            hasProfil: false, hasPrenom: false, hasActiveInscription: false,
            hasAnyInscription: false, signals: []
        })).toBe('NOUVEAU_PROSPECT')
    })
})
```

### 4. Tests critiques à écrire

| Cible | Fichier | Priorité |
|---|---|---|
| `detectKeywords`, `decideRoute` | `context-enricher.test.ts` | ★★★ |
| `validateHmac` (une fois CRIT-01 fait) | `webhook.test.ts` | ★★★ |
| `getAudience` (filtres segment, CSV, programme) | `broadcast/sender.test.ts` | ★★★ |
| Schémas Zod (HIGH-01) | `schemas/*.test.ts` | ★★ |
| Construction de tableName dans `/api/programmes` | `programmes.test.ts` | ★★ |

### 5. Tests d'intégration (routes API)

Avec `next` en mode test, mocker Supabase et WaSenderAPI :

```ts
import { describe, it, expect, vi } from 'vitest'
import { POST } from '@/app/api/messages/send/route'

describe('POST /api/messages/send', () => {
    it('refuse un payload incomplet', async () => {
        const req = new Request('http://test/api/messages/send', {
            method: 'POST',
            body: JSON.stringify({ to: '229...' })
        })
        const res = await POST(req as any)
        expect(res.status).toBe(400)
    })
})
```

### 6. Intégration CI (futur)

Créer `.github/workflows/test.yml` :
```yaml
name: Test
on: [push, pull_request]
jobs:
    test:
        runs-on: ubuntu-latest
        steps:
            - uses: actions/checkout@v4
            - uses: actions/setup-node@v4
              with: { node-version: '20' }
            - run: cd app && npm ci && npm run lint && npm test
```

## Critères d'acceptation

- `npm test` passe.
- Au moins 10 tests unitaires couvrant les fonctions pures critiques.
- Coverage mesurable (`vitest --coverage`) > 20% sur `lib/`.
- Les tests passent en CI (quand elle sera en place).

## Dépendances

- Aucune pour commencer.
- HIGH-01 (Zod) facilite les tests de validation.

# HIGH-03 — Corriger les 178 erreurs ESLint

**Sévérité** : Haute
**Effort** : M (2–3 jours en étalé)
**Finding parent** : `AUDIT.md` §3.HIGH-03

## Contexte

`npm run lint` rapporte **219 problèmes (178 erreurs, 41 warnings)**. Types dominants :

| Type | Nombre approximatif | Gravité |
|---|---|---|
| `@typescript-eslint/no-explicit-any` | 80+ erreurs | Haute (typage fantôme) |
| `react/no-unescaped-entities` | 15+ erreurs | Basse (purement visuel) |
| `react-hooks/exhaustive-deps` | ~8 warnings | Moyenne (bugs potentiels) |
| `@typescript-eslint/no-require-imports` | 1+ erreur | Moyenne |
| `react-hooks/set-state-in-effect` | 1 erreur (analytics) | Haute (cascading renders) |
| `@typescript-eslint/no-unused-vars` | ~15 warnings | Basse |

## Étapes

Approche progressive pour éviter un énorme PR.

### 1. Premier passage : auto-fix

```bash
cd app/
npm run lint -- --fix
```

Corrige ~5 erreurs (apostrophes, unused imports simples). Committer.

### 2. Nettoyer les `unused-vars` / `unused-imports` à la main

Supprimer les imports et variables déclarés mais non utilisés. ~30 min.

### 3. Corriger `react/no-unescaped-entities`

Remplacer les apostrophes `'` dans le JSX par `&apos;` ou utiliser des template strings. ~30 min.

### 4. Corriger `react-hooks/exhaustive-deps`

Pour chaque `useEffect` avec deps manquantes :
- Soit ajouter la dep (souvent le bon choix).
- Soit wrapper la fonction dans `useCallback` et ajouter la dep.
- Soit utiliser un `ref` pour les valeurs qu'on ne veut pas tracker.

Ne jamais désactiver la règle avec un commentaire `// eslint-disable`.

### 5. Corriger le bug `set-state-in-effect` dans analytics (HIGH-04)

Voir ticket `HIGH-04-analytics-setstate-effect.md`.

### 6. Remplacer les `any` progressivement

Priorité :
1. Les routes API (car elles sont le bord du système).
2. Les pages dashboard.
3. Les utilitaires internes.

Pattern de remplacement :
- `any` pour un résultat Supabase → créer un type :
  ```ts
  type ProfilProspect = {
      chat_id: string
      prenom: string | null
      // ...
  }
  const { data } = await supabase.from('Profil_Prospects').select().eq('chat_id', id).single<ProfilProspect>()
  ```
- `any` dans un callback event → utiliser le type React natif :
  ```ts
  onChange={(e: React.ChangeEvent<HTMLInputElement>) => ...}
  ```
- `any` dans un handler d'erreur → `unknown` avec narrowing :
  ```ts
  catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
  }
  ```

### 7. Supprimer `require` (no-require-imports)

Dans `/api/programmes/route.ts:135` :
```ts
const crypto = require('crypto');  // AVANT
```
Remplacer par :
```ts
import { randomUUID } from 'crypto';  // APRES
// puis: randomUUID()
```

## Critères d'acceptation

- `npm run lint` passe à < 20 erreurs (idéal : 0).
- Le projet build toujours après chaque changement.
- Aucun `// eslint-disable` ajouté pour masquer une erreur.

## Dépendances

- HIGH-04 est un sous-ensemble de ce ticket.
- Peut se faire progressivement par dossier.

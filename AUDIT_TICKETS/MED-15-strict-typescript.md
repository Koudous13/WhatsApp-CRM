# MED-15 — Activer TypeScript strict

**Sévérité** : Moyenne
**Effort** : M (variable, dépend du nombre d'erreurs)

## Contexte

Le `tsc --noEmit` passe (exit 0), ce qui suggère que `noImplicitAny` et d'autres règles strictes sont désactivés (ou que le code utilise `any` partout, ce qui est confirmé par les 44+ occurrences de `: any` dans les routes API).

Activer `strict: true` révélera les zones de typage faible et permettra au compilateur TypeScript de faire son travail.

## Étapes

### 1. Lire `tsconfig.json` actuel

Identifier les flags déjà activés.

### 2. Activer progressivement

Commencer par activer les flags individuels un par un pour étaler l'effort :

```jsonc
{
  "compilerOptions": {
    "strict": false,  // à activer à la fin

    "noImplicitAny": true,      // étape 1 — force à typer
    "strictNullChecks": true,    // étape 2 — évite les null pointer
    "strictFunctionTypes": true, // étape 3
    "noImplicitThis": true,      // étape 4
    "alwaysStrict": true,        // étape 5

    // puis enlever les flags individuels et mettre "strict": true
  }
}
```

### 3. Corriger les erreurs remontées à chaque étape

- `: any` → typer correctement (voir HIGH-03).
- Valeurs potentiellement null → narrowing avec `if (x)` ou `x?.` ou `??`.
- Types de fonctions → aligner signatures.

### 4. Mettre à jour ESLint

Ajouter :
```js
rules: {
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/explicit-function-return-type': 'warn',
  '@typescript-eslint/no-unsafe-assignment': 'error',
}
```

## Critères d'acceptation

- `tsconfig.json` avec `"strict": true`.
- `npx tsc --noEmit` passe.
- ESLint a les règles strictes activées.
- Moins de 5 occurrences de `: any` dans tout le projet.

## Dépendances

- HIGH-03 (ESLint cleanup) à faire avant pour réduire le bruit.

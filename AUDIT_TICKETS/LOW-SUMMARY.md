# Tickets BASSE priorité (regroupés)

Ces points sont des nettoyages cosmétiques. À traiter au fil de l'eau, lors des passages sur les fichiers concernés.

---

## LOW-01 — Nettoyer les `unused imports/vars` (~15 warnings ESLint)

Fichiers : `analytics/page.tsx`, `broadcast/page.tsx`, `alter_table.mjs`, etc.

```bash
cd app/
npm run lint 2>&1 | grep "is defined but never used\|is assigned a value but never used"
```

Pour chaque ligne, supprimer l'import/variable. `npm run lint -- --fix` ne suffit pas pour tout.

**Effort** : S (30 min)

---

## LOW-02 — Échapper les apostrophes dans le JSX

Warning `react/no-unescaped-entities` sur ~15 lignes. Remplacer `'` par `&apos;` dans les strings JSX, ou utiliser des template strings.

```tsx
// Avant
<p>L'équipe BloLab</p>

// Après
<p>L&apos;équipe BloLab</p>
// OU
<p>{`L'équipe BloLab`}</p>
```

**Effort** : S (30 min)

---

## LOW-03 — Corriger `react-hooks/exhaustive-deps`

~8 warnings. Ajouter les dépendances manquantes dans les `useEffect`, ou wrapper les callbacks dans `useCallback`.

Attention : ajouter aveuglément une dep peut créer une boucle infinie. Analyser chaque cas.

**Effort** : M (2h — nécessite de comprendre chaque effet).

---

## LOW-04 — Supprimer les `console.log` en production

Grep :
```bash
grep -rn "console.log\|console.warn" app/lib/ app/app/ --include="*.ts" --include="*.tsx"
```

Pour chaque log :
- **Garder** si utile (erreurs d'intégration externe, webhooks).
- **Wrap** dans `if (process.env.NODE_ENV !== 'production')` si debug uniquement.
- **Supprimer** si pur DEBUG temporaire.

Les préfixes `[DEBUG]`, `[Broadcast]`, `[Webhook]` peuvent guider.

**Effort** : S (1h)

---

## LOW-05 — Uniformiser le style Tailwind

Le projet mélange :
- Classes Tailwind directes (`px-4 py-2 bg-blue-500...`)
- Utilisation partielle de `cn()` helper
- Certaines couleurs inline (`#3b82f6`) plutôt que les tokens du thème

Après MED-13 (shadcn), passer un temps à aligner les couleurs sur les variables CSS du thème.

**Effort** : M (progressif)

---

## LOW-06 — Documenter les fichiers `blolab_*.md` à la racine

Il y a `blolab_base_informations.md`, `blolab_content.md`, `blolab_qa_knowledge.md`, `blolab_qa_knowledge_v2.md`, `blolab_qa_knowledge_v3.md`. Rôle, version canonique, utilisation ?

Voir MED-10 pour la documentation complète de la knowledge base.

**Effort** : S (inclus dans MED-10)

---

## LOW-07 — Remplacer `any` par `unknown` en attendant le vrai typage

Pour les cas où le typage correct est long à établir, utiliser `unknown` qui force le narrowing. Plus sûr que `any`.

```ts
// Avant
catch (err: any) { /* ... */ }

// Après
catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
}
```

**Effort** : inclus dans HIGH-03

---

## LOW-08 — Favicon + branding cohérent

Vérifier `app/public/` pour un favicon BloLab. Si absent, générer depuis le logo via realfavicongenerator.net.

**Effort** : S (30 min)

---

## LOW-09 — Archiver `analytics_v2_mockup_*.png`

Fichiers PNG à la racine du repo. Les déplacer dans `docs/mockups/` ou supprimer si obsolètes.

**Effort** : S (10 min)

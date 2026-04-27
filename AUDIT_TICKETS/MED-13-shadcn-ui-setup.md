# MED-13 — Ajouter shadcn/ui pour mutualiser les composants

**Sévérité** : Moyenne
**Effort** : M (4h + refactoring progressif)

## Contexte

La spec `TECH_SPEC/01_STACK_ARCHITECTURE.md` annonce "Tailwind CSS + Radix UI + shadcn/ui". Dans le code :
- `tailwind` ✅ installé
- `class-variance-authority`, `clsx`, `tailwind-merge` ✅ installés (utilisés par shadcn)
- `@radix-ui/*` ❌ **absent du package.json**
- `components/ui/` ❌ absent

Les composants UI (boutons, inputs, dialogs) sont donc réimplémentés à la main dans chaque page, avec des classes Tailwind directes. Duplication et incohérence visuelle probable.

## Étapes

### 1. Initialiser shadcn

```bash
cd app/
npx shadcn@latest init
```

Répondre aux prompts (style : default, base color : neutral ou slate selon la charte, CSS variables : oui).

Cela crée :
- `components.json`
- `components/ui/`
- Modifie `tailwind.config.*` et `globals.css`

### 2. Installer les composants de base

```bash
npx shadcn@latest add button input label textarea dialog dropdown-menu select tabs table badge toast
```

### 3. Refactorer les pages une par une

Remplacer les boutons customs (`<button className="px-4 py-2 bg-primary...">`) par `<Button>`, les modals DIY par `<Dialog>`, etc.

Priorité : Broadcast (la plus complexe), puis Inbox, puis les autres.

### 4. Créer un toast global pour les erreurs

À la place des `console.error()` muets, afficher un toast shadcn :
```tsx
toast.error('Erreur : ' + err.message)
```

## Critères d'acceptation

- `components/ui/` présent avec les composants essentiels.
- Au moins une page (Broadcast) refactorée en shadcn.
- Cohérence visuelle améliorée.
- Builds et tests passent.

## Dépendances

- Aucune technique, mais à coordonner avec MED-05 (loading/error states).

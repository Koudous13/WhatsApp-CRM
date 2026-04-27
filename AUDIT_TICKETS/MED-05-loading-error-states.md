# MED-05 — Ajouter les states Next.js `loading.tsx`, `error.tsx`, `not-found.tsx`

**Sévérité** : Moyenne
**Effort** : M (2–3h)

## Contexte

Aucun fichier `loading.tsx`, `error.tsx`, `not-found.tsx` dans tout le projet. Conséquence :
- Pendant un navigate, l'utilisateur voit un écran blanc jusqu'au rendu de la page.
- Si une erreur se produit (ex: pas d'auth Supabase), Next.js montre sa page d'erreur par défaut minimaliste.

## Étapes

Créer dans `app/app/(dashboard)/` :

### 1. `loading.tsx`

```tsx
export default function Loading() {
    return (
        <div className="flex items-center justify-center h-screen">
            <div className="text-muted-foreground animate-pulse">Chargement...</div>
        </div>
    )
}
```

### 2. `error.tsx`

```tsx
'use client'

import { useEffect } from 'react'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    useEffect(() => {
        console.error('[Dashboard] Error:', error)
    }, [error])

    return (
        <div className="flex flex-col items-center justify-center h-screen gap-4">
            <h2 className="text-xl font-semibold">Une erreur s'est produite</h2>
            <p className="text-muted-foreground text-sm max-w-md text-center">{error.message}</p>
            <button onClick={reset} className="px-4 py-2 bg-primary text-primary-foreground rounded">
                Réessayer
            </button>
        </div>
    )
}
```

### 3. `not-found.tsx`

```tsx
import Link from 'next/link'

export default function NotFound() {
    return (
        <div className="flex flex-col items-center justify-center h-screen gap-4">
            <h2 className="text-2xl font-semibold">Page introuvable</h2>
            <Link href="/inbox" className="text-primary hover:underline">Retour à l'inbox</Link>
        </div>
    )
}
```

### 4. États par page

Pour les pages qui font leurs propres fetch :
- Remplacer les `useEffect` synchrones bugués (voir HIGH-04) par des loading states propres.
- Afficher un skeleton plutôt qu'un spinner quand c'est possible (meilleur perçu de performance).

## Critères d'acceptation

- Un navigate vers `/inbox` affiche le loading state avant le rendu.
- Une erreur provoquée artificiellement (ex: throw dans le page) affiche l'error.tsx.
- Un `/foobar` affiche not-found.tsx.
- Cohérence visuelle avec le reste du dashboard.

## Dépendances

- HIGH-04 (bug setState dans analytics) à faire avant ou en même temps.

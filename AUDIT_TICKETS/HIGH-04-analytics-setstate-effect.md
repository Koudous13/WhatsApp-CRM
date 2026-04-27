# HIGH-04 — Bug React : `setState` dans `useEffect` (Analytics)

**Sévérité** : Haute
**Effort** : S (30 min)
**Finding parent** : `AUDIT.md` §3.HIGH-04

## Contexte

`analytics/page.tsx:108` déclare `useEffect(() => { fetchData() }, [])` où `fetchData()` appelle `setState` synchronously. React 19 remonte cette erreur explicitement :

> Calling setState synchronously within an effect can trigger cascading renders.

Conséquence : re-renders en cascade, possibles états transitoires incohérents.

## Fichiers concernés

- `app/app/(dashboard)/analytics/page.tsx` lignes 106-108 (et la fonction `fetchData` qui précède)

## Étapes

### 1. Identifier la fonction

Lire le bloc autour de la ligne 108. Il y a probablement :

```tsx
async function fetchData() {
    const { data } = await supabase.from('...').select()
    setData(data)        // ← setState synchrone pendant l'effect
    setLoading(false)    // ← idem
}

useEffect(() => { fetchData() }, [])
```

### 2. Corriger avec cleanup + async wrapper

```tsx
useEffect(() => {
    let cancelled = false

    async function load() {
        try {
            const { data, error } = await supabase.from('...').select()
            if (cancelled) return
            if (error) {
                setError(error.message)
                return
            }
            setData(data)
        } catch (e: unknown) {
            if (cancelled) return
            setError(e instanceof Error ? e.message : String(e))
        } finally {
            if (!cancelled) setLoading(false)
        }
    }

    load()
    return () => { cancelled = true }
}, [])
```

### 3. Appliquer le même pattern aux autres pages dashboard si nécessaire

Scanner les autres `useEffect` avec fetch async :
```bash
grep -n "useEffect" app/app/\(dashboard\)/**/page.tsx
```

Les pages Inbox, Broadcast, Contacts ont probablement les mêmes patterns à corriger.

## Critères d'acceptation

- ESLint ne remonte plus `react-hooks/set-state-in-effect` sur analytics/page.tsx.
- La page Analytics charge correctement les données.
- Pas de flicker visible lors du chargement.
- Si l'utilisateur quitte la page avant le fetch : pas de warning "setState on unmounted component".

## Dépendances

- Sous-ensemble de HIGH-03. À faire en priorité car c'est un bug fonctionnel, pas juste stylistique.

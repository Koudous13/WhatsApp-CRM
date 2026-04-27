# MED-07 — Supprimer ou protéger `/api/broadcast/test`

**Sévérité** : Moyenne
**Effort** : S (15 min)

## Contexte

La route `GET /api/broadcast/test` expose (selon le rapport d'exploration initial) le préfixe de l'API_KEY et des données de campagne en GET sans authentification. Même si c'était pour du debug, elle n'a rien à faire en prod.

## Étapes

### 1. Lire `app/app/api/broadcast/test/route.ts`

Vérifier ce qu'elle expose réellement.

### 2. Décision

**Option A — Supprimer**
```bash
rm -rf app/app/api/broadcast/test
```

**Option B — Garder en dev uniquement**
```ts
export async function GET() {
    if (process.env.NODE_ENV !== 'development') {
        return NextResponse.json({ error: 'Not available' }, { status: 404 })
    }
    // ... logique actuelle
}
```

**Option C — Protéger comme les autres**
Appliquer le middleware (CRIT-02) + `requireUser()`.

### 3. Recommandation : Option A

Les routes de "test" en prod sont presque toujours une mauvaise idée. Si besoin de tester un envoi, le faire via un script local ou un hook de CI.

## Critères d'acceptation

- `GET /api/broadcast/test` en prod retourne 404 ou 401.
- Aucun secret ni donnée de campagne fuité.

## Dépendances

- Aucune.

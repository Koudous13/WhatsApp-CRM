# HIGH-02 — Route `/api/broadcast/update` au mauvais chemin

**Sévérité** : Haute (mais correction triviale)
**Effort** : S (10 min)
**Finding parent** : `AUDIT.md` §3.HIGH-02

## Contexte

Le fichier `app/api/broadcast/update/route.ts` existe dans le dossier **`app/api/`** (à la racine de `app/`), et non dans **`app/app/api/`** comme toutes les autres routes. Next.js App Router ne sert pas les routes en dehors du dossier `app/`. Cette route est donc **morte** — elle n'est pas atteignable via HTTP.

## Fichiers concernés

- `app/api/broadcast/update/route.ts` (à déplacer ou supprimer)

## Étapes

### 1. Vérifier si cette route est utilisée

```bash
cd /d/Projet/WhatsApp-CRM
grep -r "broadcast/update" app/app/ app/components/ app/lib/ 2>/dev/null
```

Si aucun appelant : supprimer.
Si des appelants existent : déplacer.

### 2a. Si utilisée : déplacer

```bash
mkdir -p app/app/api/broadcast/update
mv app/api/broadcast/update/route.ts app/app/api/broadcast/update/route.ts
# Supprimer le dossier orphelin
rmdir app/api/broadcast/update
rmdir app/api/broadcast
rmdir app/api
```

### 2b. Si non utilisée : supprimer

```bash
rm -rf app/api/broadcast
rmdir app/api 2>/dev/null
```

### 3. Vérifier qu'aucune autre route n'est dans ce mauvais dossier

```bash
find app/api -name "route.ts" 2>/dev/null
# Devrait ne rien retourner ensuite
```

### 4. Tester

```bash
curl -X POST https://<dev-url>/api/broadcast/update -d '{}' -H "Content-Type: application/json"
# Si déplacée : 401 ou 400 selon CRIT-02
# Si supprimée : 404
```

## Critères d'acceptation

- Le dossier `app/api/` (à la racine, pas `app/app/api/`) n'existe plus.
- Si la route était utilisée, elle est maintenant fonctionnelle à `/api/broadcast/update`.
- Le lint + build passent.

## Dépendances

- Aucune.

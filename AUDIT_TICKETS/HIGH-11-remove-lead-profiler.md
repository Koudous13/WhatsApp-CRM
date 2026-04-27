# HIGH-11 — Supprimer `lib/ai/lead-profiler.ts` (dead code)

**Sévérité** : Haute (faible effort, dette claire)
**Effort** : S (10 min)
**Finding parent** : `AUDIT.md` §3.HIGH-11

## Contexte

Le fichier `app/lib/ai/lead-profiler.ts` n'est importé nulle part dans le code. Le profilage des leads est réalisé par le tool `manage_crm_profile` défini directement dans `rag-pipeline.ts`. Le fichier est donc du dead code qui peut confondre un repreneur.

## Étapes

### 1. Vérifier l'absence d'import

```bash
cd /d/Projet/WhatsApp-CRM
grep -r "lead-profiler" app/ --exclude-dir=node_modules
# Si rien ne ressort sauf le fichier lui-même, supprimer
```

### 2. Supprimer

```bash
rm app/lib/ai/lead-profiler.ts
```

### 3. Si quelque chose dépendait de la logique (prompt, format)

Lire le fichier avant suppression et vérifier si une fonction utile y dort qui mériterait d'être extraite. Si oui, la déplacer vers un module approprié avec un import réel.

### 4. Committer

```bash
git rm app/lib/ai/lead-profiler.ts
git commit -m "chore: remove dead lead-profiler module (replaced by manage_crm_profile tool)"
```

## Critères d'acceptation

- Le fichier est supprimé.
- `npm run lint && npx tsc --noEmit` passe.
- Le build passe.
- Aucune fonctionnalité cassée.

## Dépendances

- Aucune.

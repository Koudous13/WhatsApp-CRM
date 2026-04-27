# HIGH-05 — Corriger les 6 vulnérabilités npm

**Sévérité** : Haute
**Effort** : S (1h)
**Finding parent** : `AUDIT.md` §3.HIGH-05

## Contexte

`npm install` rapporte **6 vulnérabilités (2 moderate + 4 high)**. Non analysées individuellement pendant l'audit.

## Étapes

### 1. Lister

```bash
cd app/
npm audit
```

Noter chaque CVE : package, sévérité, path de dépendance (direct/transitive), fix disponible ou non.

### 2. Corriger les fixables

```bash
npm audit fix
```

Cela met à jour les versions mineures et patchs compatibles.

### 3. Évaluer les `--force`

Pour chaque CVE restante après `audit fix` :
- Lire l'avis CVE.
- Vérifier si un breaking change est impliqué.
- Si oui : tester manuellement la feature impactée après mise à jour.
- Si non exploitable dans ce projet (ex: vulnérabilité dans un chemin de code non utilisé) : documenter dans un `SECURITY.md` et accepter le risque.

```bash
npm audit fix --force  # uniquement après analyse, en séquence
```

### 4. Revérifier

```bash
npm audit
npm run build   # s'assurer que rien n'est cassé
npm run lint
```

### 5. Committer `package-lock.json`

## Critères d'acceptation

- `npm audit` rapporte 0 vulnérabilité, OU un document `SECURITY.md` justifie les vulnérabilités restantes acceptées.
- Le build passe toujours.
- Les features du dashboard fonctionnent (test manuel : Inbox, Broadcast, Analytics).

## Dépendances

- Aucune.

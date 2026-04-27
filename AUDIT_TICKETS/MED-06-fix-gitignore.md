# MED-06 — Corriger `.gitignore` racine

**Sévérité** : Moyenne
**Effort** : S (10 min)

## Contexte

`.gitignore` racine contient des patterns problématiques :

```
/node_modules
/.next
/.vercel
.env*
*.log
/proposition_front_end
/app/node_modules
/app/.next
/app/.env*
/app/.test-build*
/app/tsconfig.tsbuildinfo
/TECH_SPEC          ← ligne 12 : TECH_SPEC ignoré
*.mp3
*.png
*.json              ← ligne 15 : TOUS les JSON ignorés
```

Problèmes :
- `/TECH_SPEC` ignore tout le dossier. Les fichiers actuels sont committés (ajoutés avant la règle) mais tout nouveau fichier de spec serait ignoré silencieusement.
- `*.json` est **beaucoup trop large** : ignore `package.json`, `tsconfig.json`, `next.config.mjs` (non), `eslint.config.mjs` (non), les futurs `knowledge_base.json`, etc. Ils sont committés par inertie mais dangereux.

## Étapes

### 1. Retirer `/TECH_SPEC`

La spec doit être versionnée.

### 2. Restreindre `*.json`

Remplacer `*.json` par des patterns précis. Si l'intention était d'ignorer des exports/dumps de knowledge base, faire :
```
# Fichiers de données / exports — ne pas committer
/exports/*.json
/knowledge_dumps/*.json
```

### 3. Corriger le `.gitignore` racine complet

Proposition de remplacement :
```gitignore
# Node
/node_modules/
/app/node_modules/

# Next.js
/app/.next/
/app/.vercel/
/.vercel

# Env (sauf .env.example)
.env
.env.local
.env.*.local
/app/.env
/app/.env.local
/app/.env.*.local
!app/.env.example

# Logs
*.log

# IDE
.DS_Store
.idea/
.vscode/

# Build artefacts
/app/.test-build*
/app/tsconfig.tsbuildinfo
/app/out/

# Misc
/proposition_front_end

# Uploads locaux / temporaires
/tmp/
*.mp3
*.wav
```

### 4. Vérifier qu'aucun secret n'a été committé historiquement

```bash
git log --all --full-history -- '*.env*'
git log --all --full-history -- '*.env'
```

Si jamais un `.env.local` a été committé, il faut le purger (`git filter-branch` ou `bfg`).

### 5. Ajouter `app/.env.example` au commit (voir MED-02)

## Critères d'acceptation

- `.gitignore` n'a plus `*.json` ni `/TECH_SPEC`.
- `app/.env.example` est bien tracké par git.
- `git status` ne montre pas de changement inattendu après la correction.

## Dépendances

- MED-02 (créer `.env.example`) dépend de cette modif.

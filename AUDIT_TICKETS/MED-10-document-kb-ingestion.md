# MED-10 — Documenter l'ingestion de la knowledge base

**Sévérité** : Moyenne
**Effort** : S (1h)

## Contexte

- 13 fichiers `Knowledge_V4_Chunks/Part_*.txt` à la racine du repo.
- `app/scripts/import-kb.mjs` existe mais n'est documenté nulle part.
- Plusieurs versions `blolab_qa_knowledge_v{1,2,3}.md`, `blolab_content.md`, `blolab_base_informations.md` à la racine — lesquelles sont réellement ingérées ?
- `ASSISTANT RAG IA WHATSAPP PROFILAGE.json` à la racine — rôle ?

Un repreneur ne peut pas reconstruire ou mettre à jour la knowledge base sans reverse-engineering.

## Étapes

### 1. Auditer `scripts/import-kb.mjs`

Lire le script, comprendre :
- Quels fichiers il lit (pattern) ?
- Comment il chunke ?
- Quelle table il écrit (`knowledge_base` probablement) ?
- Quelle fonction d'embedding il utilise ?

### 2. Créer `docs/KNOWLEDGE_BASE.md`

Structure proposée :
```md
# Knowledge Base

## Source
- `Knowledge_V4_Chunks/` : chunks manuels importés via `scripts/import-kb.mjs`.
- blolab.bj (scraping manuel via `/api/knowledge/scrape` — ou auto, voir HIGH-08).

## Table cible
`public.knowledge_base` avec `pgvector`, colonnes :
- `content` text
- `embedding` vector(768)
- `metadata` jsonb
- `source` text ("manual" ou "scrape")
- `version` text

## Workflow ingestion
1. Ajouter/modifier les fichiers .txt dans `Knowledge_V4_Chunks/`
2. `cd app && node scripts/import-kb.mjs`
3. Vérifier via le dashboard Knowledge

## Fichiers de référence
- `blolab_qa_knowledge_v3.md` : dernière version canonique des Q/R.
- `blolab_content.md`, `blolab_base_informations.md` : contenu éditorial.
- `ASSISTANT RAG IA WHATSAPP PROFILAGE.json` : <à vérifier ce que c'est>.
```

### 3. Supprimer ou archiver les versions obsolètes

Si `blolab_qa_knowledge_v3.md` est la référence, archiver v1 et v2 dans `legacy/`.

### 4. Clarifier `ASSISTANT RAG IA WHATSAPP PROFILAGE.json`

Ouvrir le fichier. S'il n'est pas utilisé par le code (grep confirme), l'archiver ou le supprimer.

## Critères d'acceptation

- `docs/KNOWLEDGE_BASE.md` documente le workflow complet.
- Script `import-kb.mjs` fonctionne en local et est référencé dans le README.
- Fichiers obsolètes archivés.

## Dépendances

- Aucune.

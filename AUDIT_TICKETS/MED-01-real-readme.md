# MED-01 — Créer un vrai README pour le handover

**Sévérité** : Moyenne
**Effort** : S (1–2h)

## Contexte

- `README.md` à la racine : inexistant.
- `app/README.md` : boilerplate `create-next-app` — inutilisable pour un repreneur.

## Étapes

Créer `README.md` à la racine avec :
- Vue d'ensemble (2 paragraphes) : le CRM WhatsApp BloLab, pour qui, pourquoi.
- Stack en 1 tableau synthétique.
- Structure du repo (`app/`, `TECH_SPEC/`, `AUDIT.md`, `AUDIT_TICKETS/`, `Knowledge_V4_Chunks/`).
- Comment démarrer en local (link vers `app/README.md`).
- Liens vers `AUDIT.md` et `TECH_SPEC/SPEC_TECHNIQUE_COMPLETE.md`.

Réécrire `app/README.md` avec :
- Prérequis (Node 20+, compte Supabase, clé WaSenderAPI, clé DeepSeek).
- Variables d'environnement requises (référencer MED-02 `.env.example`).
- Démarrage :
  ```
  npm install
  cp .env.example .env.local && nano .env.local
  npm run dev
  ```
- Scripts disponibles (`dev`, `build`, `start`, `lint`, `test` une fois HIGH-10 fait).
- Structure des dossiers (`app/`, `api/`, `lib/`, `components/`).
- Workflow de migration DB (référencer HIGH-09).
- Liens vers les cahiers des charges (`TECH_SPEC/`).

## Critères d'acceptation

- `README.md` racine existe et permet à un repreneur de comprendre le projet en 3 min.
- `app/README.md` permet de démarrer en local en 10 min (avec les clés).

## Dépendances

- MED-02 (`.env.example`) en même temps.

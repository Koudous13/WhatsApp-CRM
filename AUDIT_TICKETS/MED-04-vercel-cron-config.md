# MED-04 — Créer `vercel.json` avec les cron jobs

**Sévérité** : Moyenne
**Effort** : S (30 min)

## Contexte

Pas de `vercel.json`. Le code attend pourtant des cron jobs :
- `/api/broadcast/tick` vérifie `CRON_SECRET` mais n'est déclenché par rien (à moins d'un service externe type cron-job.org configuré hors repo).
- Monitoring session (W6) spec'é mais pas implémenté.
- Scraping auto (W4, voir HIGH-08) idem.

## Étapes

Créer `vercel.json` à la racine de l'app (ou du repo si monorepo-like) :

```json
{
  "crons": [
    {
      "path": "/api/broadcast/tick",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

(Vercel Hobby limite à 1 cron job / 24h. Passer à Pro pour plus.)

Quand HIGH-07 (STT) et HIGH-08 (scraping) sont faits, ajouter :
```json
{
  "crons": [
    { "path": "/api/broadcast/tick", "schedule": "*/5 * * * *" },
    { "path": "/api/cron/scrape-blolab", "schedule": "0 3 * * 1" },
    { "path": "/api/cron/session-check", "schedule": "*/5 * * * *" }
  ]
}
```

## Critères d'acceptation

- `vercel.json` committé.
- Après déploiement, les crons apparaissent dans le dashboard Vercel (Deployments → Cron Jobs).
- Les crons s'exécutent avec l'`authorization: Bearer <CRON_SECRET>` header.

## Dépendances

- `CRON_SECRET` configuré dans les env Vercel prod.

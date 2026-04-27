# HIGH-08 — Scraping auto blolab.bj : cron ou décision explicite de garder manuel

**Sévérité** : Haute (divergence produit)
**Effort** : M (1 jour)
**Finding parent** : `AUDIT.md` §3.HIGH-08, gap SPEC W4

## Contexte

Spec `TECH_SPEC/06_WORKFLOW_SCRAPING_RAG.md` : scraper Cheerio + cron hebdo + versioning + alerte email en cas d'échec.

État actuel :
- `cheerio` en dépendance.
- Route `/api/knowledge/scrape` existe (manuelle).
- Aucun `vercel.json` donc aucun cron Vercel.
- `lib/scraper/` n'existe pas.

## Options

**Option A — Scraping manuel uniquement** (simple)
- Mettre à jour la spec.
- Plus fiable (contrôle humain).
- Désavantage : oublis possibles quand blolab.bj change.

**Option B — Cron hebdo Vercel**
- Automatique, suit la spec.
- Risque : incident non détecté si le scraper casse.

## Étapes (Option B)

### 1. Créer `vercel.json`

```json
{
  "crons": [
    { "path": "/api/cron/scrape-blolab", "schedule": "0 3 * * 1" }
  ]
}
```
(Lundi 3h du matin)

### 2. Créer la route

```ts
// app/app/api/cron/scrape-blolab/route.ts
export async function GET(req: NextRequest) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const result = await scrapeAndIngest()
        return NextResponse.json({ ok: true, chunks: result.chunksCount })
    } catch (err: any) {
        await sendTelegramAlert(`[CRON] Échec scraping blolab.bj: ${err.message}`)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
```

### 3. Extraire la logique actuelle de `/api/knowledge/scrape` vers `lib/scraper/blolab.ts`

Factoriser pour que la route manuelle et le cron utilisent le même code.

### 4. Versioning des chunks

```sql
ALTER TABLE knowledge_base ADD COLUMN IF NOT EXISTS version TEXT;
ALTER TABLE knowledge_base ADD COLUMN IF NOT EXISTS scraped_at TIMESTAMPTZ;
```

Lors du scrape, marquer les anciens chunks `archived = true` et insérer les nouveaux avec `version = today's date`. Cela permet le rollback.

### 5. Tester

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://.../api/cron/scrape-blolab
```

## Critères d'acceptation

- `vercel.json` contient le cron.
- Le cron s'exécute (vérifiable dans les logs Vercel).
- Si le site blolab.bj est down, une alerte Telegram est envoyée.
- Les anciens chunks sont archivés, pas supprimés (rollback possible).

## Dépendances

- Aucune. Peut se faire indépendamment.

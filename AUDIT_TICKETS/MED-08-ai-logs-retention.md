# MED-08 — Politique de rétention sur `ai_logs`

**Sévérité** : Moyenne
**Effort** : S (30 min)

## Contexte

La table `ai_logs` reçoit des écritures à chaque interaction (webhook, broadcast, alerte, debug — ce dernier sera retiré via CRIT-06). Elle grossit linéairement sans TTL.

Conséquences :
- Coût Supabase qui augmente.
- Latence des requêtes analytics qui la touchent.
- Risque RGPD (logs contenant potentiellement du contenu de message utilisateur).

## Étapes

### 1. Créer une fonction Postgres de purge

```sql
CREATE OR REPLACE FUNCTION cleanup_old_ai_logs(retention_days integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    deleted_count integer;
BEGIN
    DELETE FROM ai_logs
    WHERE created_at < NOW() - (retention_days || ' days')::interval;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION cleanup_old_ai_logs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION cleanup_old_ai_logs(integer) TO service_role;
```

### 2. Programmer via Supabase `pg_cron`

Si l'extension est activée :
```sql
SELECT cron.schedule('cleanup_ai_logs_daily', '0 2 * * *',
    $$ SELECT cleanup_old_ai_logs(30) $$);
```

Sinon, créer une route cron Vercel `/api/cron/cleanup-logs` qui appelle la fonction via `supabase.rpc('cleanup_old_ai_logs', { retention_days: 30 })`.

### 3. Aligner avec RGPD

30 jours est un compromis. Si les messages contiennent des données personnelles qualifiées, descendre à 7–14 jours.

### 4. Si historique actuel massif → purge initiale

```sql
SELECT cleanup_old_ai_logs(30);  -- purge tout ce qui a plus de 30j
```

## Critères d'acceptation

- Fonction `cleanup_old_ai_logs` créée.
- Exécution journalière programmée (pg_cron OU Vercel Cron).
- Table `ai_logs` ne contient plus de ligne > 30 jours après 24h.

## Dépendances

- CRIT-06 (retrait du DEBUG) à faire avant, sinon la purge va juste compenser le spam.

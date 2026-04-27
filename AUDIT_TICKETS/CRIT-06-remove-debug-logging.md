# CRIT-06 — Supprimer le "DEBUG EXTRÊME" du webhook

**Sévérité** : Critique
**Effort** : S (15 min)
**Finding parent** : `AUDIT.md` §3.CRIT-06

## Contexte

Le webhook `POST /api/webhooks/wasender` enregistre systématiquement le corps brut de la requête et **tous les headers** dans la table `ai_logs`, avant toute validation. Ce comportement est annoncé dans un commentaire :

```
// 🔥 DEBUG EXTRÊME : On enregistre TOUT ce qui touche l'URL du webhook
```

C'est un quick win immédiat, 3 implications :
1. **RGPD** : le contenu privé des messages WhatsApp (numéros + corps) est stocké en clair, sans politique de rétention.
2. **Sécurité** : les headers contiennent `x-webhook-signature` (signature HMAC), `authorization` si présent, cookies éventuels. Un accès à la table `ai_logs` (via RLS permissive — voir CRIT-03) leak ces secrets.
3. **Coût & performance** : la table grossit sans limite. Chaque requête entraîne une écriture.

## Fichiers concernés

- `app/app/api/webhooks/wasender/route.ts:21-27`

## Étapes

### 1. Supprimer le bloc

Supprimer les lignes 21-27 :

```ts
// 🔥 DEBUG EXTRÊME : On enregistre TOUT ce qui touche l'URL du webhook
const supabaseDebug = createAdminClient()
await supabaseDebug.from('ai_logs').insert({
    contact_chat_id: 'DEBUG_WEBHOOK',
    user_message: rawBody.substring(0, 5000),
    system_prompt: `Headers: ${JSON.stringify(Object.fromEntries(req.headers))}`,
})
```

### 2. Si un logging minimal reste nécessaire

Remplacer par une ligne discrète après validation HMAC :

```ts
// Log minimal, seulement les métadonnées
console.log(`[Webhook] event=${event} from=${from.slice(-4)} type=${messageType}`)
```

### 3. Nettoyer les entrées existantes dans `ai_logs`

```sql
DELETE FROM ai_logs WHERE contact_chat_id = 'DEBUG_WEBHOOK';
```

### 4. Ajouter une politique de rétention (cf. MED-08)

```sql
CREATE OR REPLACE FUNCTION cleanup_old_ai_logs() RETURNS void
LANGUAGE sql AS $$
    DELETE FROM ai_logs WHERE created_at < NOW() - INTERVAL '30 days';
$$;
-- Planifier via pg_cron ou Vercel Cron
```

## Critères d'acceptation

- Le bloc "DEBUG EXTRÊME" est supprimé.
- Après un webhook valide, aucune ligne `contact_chat_id = 'DEBUG_WEBHOOK'` n'est créée.
- Les entrées existantes avec `contact_chat_id = 'DEBUG_WEBHOOK'` sont purgées.
- La taille de `ai_logs` ne grossit plus de manière incontrôlée (à surveiller sur 24h).

## Dépendances

- Aucune. À faire immédiatement.
- Idéalement groupé avec CRIT-01 dans le même commit.

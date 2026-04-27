# CRIT-03 — Policies RLS Supabase ouvertes à tous

**Sévérité** : Critique
**Effort** : L (1 journée)
**Finding parent** : `AUDIT.md` §3.CRIT-03

## Contexte

Toutes les policies RLS observées sont `USING (true) WITH CHECK (true)`, ce qui rend RLS effectivement inactive. Combiné au fait que le code navigateur (pages Inbox, Broadcast, Contacts) utilise `createClient()` avec l'anon key pour requêter Supabase directement, la base est effectivement lisible et modifiable **depuis n'importe quel navigateur sans authentification**.

Même si CRIT-02 (auth sur routes API) est corrigé, RLS doit être correcte car :
- L'anon key est embarquée dans le bundle JS client (`NEXT_PUBLIC_SUPABASE_ANON_KEY`).
- Un attaquant peut l'extraire et appeler Supabase REST directement.

## Fichiers concernés

- `app/SQL_MIGRATION_INSCRIPTIONS.sql:41-43`
- `app/SQL_MIGRATION_SMART_SEGMENTS.sql:17-22`
- `app/MIGRATION_V2_INBOX.sql:18-21`
- Policies des autres tables (`Profil_Prospects`, `conversations`, `messages`, `broadcasts`, `ai_logs`, `programmes`, `programme_champs`, `knowledge_base`, `inscript_*`) — à auditer directement dans la console Supabase.

## Stratégie

Le projet est mono-admin pour l'instant (pas de multi-tenant). Deux approches possibles :

### Option A — RLS stricte avec table `admin_users`

1. Créer une table `admin_users(user_id uuid primary key references auth.users)` pour lister les comptes admin.
2. Toutes les tables applicatives (conversations, messages, Profil_Prospects, broadcasts, ai_logs, knowledge_base, inscript_*, programmes, etc.) ne sont accessibles QUE si `auth.uid()` est dans `admin_users`.
3. Côté navigateur, toutes les requêtes passent par l'anon key mais sont filtrées par RLS → un utilisateur non-admin voit zéro ligne.
4. Côté serveur (routes API sensibles), utiliser soit `service_role` (bypass RLS — ce qui est déjà le cas), soit `createClient()` (respecte RLS) selon le besoin.

### Option B — Tout via routes API serveur, navigateur passif

1. Interdire les requêtes Supabase directes depuis le navigateur.
2. Passer par des routes API Next.js qui vérifient l'auth et utilisent `service_role`.
3. RLS peut rester en `USING (false)` pour anon (interdiction totale).

**Recommandation** : Option A. Plus conforme à l'esprit Supabase + garde le Realtime côté client qui marche déjà (Inbox).

## Étapes (Option A)

### 1. Créer la table admin_users

```sql
CREATE TABLE IF NOT EXISTS admin_users (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Seeding manuel après création du premier compte
-- INSERT INTO admin_users (user_id) VALUES ('<ton-uid>');
```

### 2. Fonction helper

```sql
CREATE OR REPLACE FUNCTION is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$ SELECT EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()) $$;
```

### 3. Policies sur chaque table

Pattern à appliquer à toutes les tables :

```sql
ALTER TABLE public."Profil_Prospects" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for Profil_Prospects" ON public."Profil_Prospects";
CREATE POLICY "Admin read-write" ON public."Profil_Prospects"
    FOR ALL USING (is_admin()) WITH CHECK (is_admin());
```

Répéter pour : `conversations`, `messages`, `broadcasts`, `broadcast_sequences`, `ai_logs`, `knowledge_base`, `Inscriptions`, `Smart_Segments`, `Inbox_Categories`, `programmes`, `programme_champs`, `programme_schema`, `programme_colonnes`, `stats_overrides`, toutes les tables `inscript_*`.

### 4. Générer la liste complète

```sql
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename;
```

Toute policy avec `qual = 'true'` ou `with_check = 'true'` doit être remplacée.

### 5. Tester depuis le navigateur non-admin

Ouvrir la console navigateur sur une page publique, exécuter :
```js
const res = await fetch('https://<ref>.supabase.co/rest/v1/Profil_Prospects?select=*&limit=1', {
    headers: { apikey: '<ANON_KEY>', Authorization: 'Bearer <ANON_KEY>' }
})
// Avant correction : retourne les données. Après : retourne [].
```

## Critères d'acceptation

- Toutes les tables applicatives ont RLS activée.
- Aucune policy ne contient `USING (true)` ou `WITH CHECK (true)`.
- Un utilisateur non-admin connecté ne voit rien (`SELECT *` retourne 0 lignes).
- Un admin connecté voit tout.
- Le dashboard fonctionne toujours après la modification (tester chaque page).
- `service_role` continue à tout voir (les routes API serveur marchent).

## Dépendances

- À faire en parallèle de CRIT-02. L'une sans l'autre laisse une faille.
- CRIT-04 (verrouillage `admin_execute_sql`) doit être fait AVANT, sinon RLS peut être contournée.

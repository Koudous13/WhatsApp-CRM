# MED-09 — Implémenter le droit à l'oubli (RGPD)

**Sévérité** : Moyenne
**Effort** : M (1 jour)

## Contexte

Le projet traite des données personnelles (numéros WhatsApp, contenu de messages, profils enrichis). Aucun mécanisme pour supprimer les données d'un prospect qui en fait la demande.

Selon le RGPD (si l'audience inclut des utilisateurs UE — même une petite minorité), cette fonctionnalité est obligatoire.

## Étapes

### 1. Endpoint de suppression

Créer une commande côté admin : `POST /api/admin/delete-contact` avec :
```json
{ "chat_id": "229..." }
```

Après vérification admin :
1. Supprimer de `Profil_Prospects`.
2. Supprimer de `conversations` (cascade supposée en place).
3. Supprimer de `messages` (cascade).
4. Supprimer de `ai_logs`.
5. Anonymiser dans `broadcasts.recipients` si snapshot (remplacer chat_id par hash).
6. Supprimer de toutes les tables `inscript_*`.

### 2. Automatiser via commande WhatsApp ?

Option avancée : un message "SUPPRIMER" ou équivalent déclenche la suppression automatique (après confirmation).

### 3. Journaliser la suppression

Dans une table `deletion_log(chat_id_hash, deleted_at, reason)` — sans garder le chat_id en clair.

### 4. Documenter

Dans `README.md` ou `PRIVACY.md` : procédure pour un utilisateur qui demande la suppression de ses données.

## Critères d'acceptation

- Endpoint admin fonctionnel.
- Toutes les tables sont nettoyées pour un chat_id donné.
- Un log de la suppression est conservé (sans le chat_id).
- Documentation utilisateur créée.

## Dépendances

- CRIT-02 (auth) — sans ça, endpoint admin = faille critique.
- CRIT-03 (RLS) — policies admin doivent être strictes.

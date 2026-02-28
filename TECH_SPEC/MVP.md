# MVP — BloLab WhatsApp CRM IA
### Version Minimale Fonctionnelle

---

## Pourquoi un MVP ?

Plutôt que de tout construire d'un coup, on livre un système **fonctionnel dès la première semaine** en se concentrant sur le cœur du produit : **un agent IA WhatsApp qui répond, profite et stocke**.

---

## Ce qu'on fait dans le MVP

### ✅ 1. Réception des messages texte (Webhook)
- L'endpoint `/api/webhooks/wasender` reçoit les messages
- Validation HMAC pour la sécurité
- **Seuls les messages texte** sont traités par l'IA
- Tout autre type (audio, image, vidéo, doc) →  escalade humaine

### ✅ 2. Réponse IA (RAG simplifié)
- Embedding du message avec Gemini
- Recherche dans la table `documents` (pgvector)
- Appel Gemini 2.0 Flash avec le contexte trouvé
- Réponse envoyée via WaSenderAPI

### ✅ 3. Profilage silencieux
- Après chaque échange, le lead-profiler extrait : prénom, profil_type, intérêt, objectif, programme recommandé, score_engagement
- **UPSERT dans `Profil_Prospects`** via `chat_id`

### ✅ 4. Dashboard minimaliste (lecture seule)
- **Page Inbox** : liste des conversations + messages en temps réel (Supabase Realtime)
- **Page Contacts** : liste des profils prospects avec leurs données extraites
- Authentification admin (Supabase Auth)

### ✅ 5. Base de connaissances manuelle
- Interface pour ajouter/modifier des entrées dans `documents`
- Pas de scraping automatique dans le MVP — on alimente la KB manuellement

### ✅ 6. Broadcast / Campagnes
- Création d'une campagne avec message texte et filtre audience (opt_in, programme, persona)
- Envoi groupé avec rate limiting (1 message toutes les 1-2s)
- Suivi basique : envoyé / délivré / échoué

### ✅ 7. Analytics & Rapports
- Page analytics simple : nombre de conversations, nouveaux contacts/jour, taux de réponse IA
- Top programmes recommandés par l'IA
- Score d'engagement moyen des prospects

### ✅ 8. Alertes Telegram — Lead Chaud
- Quand `score_engagement >= 80`, alerte Telegram instantanée
- Infos : prénom, profil, programme recommandé, étape, numéro WhatsApp

---

## Ce qu'on NE fait PAS dans le MVP

| Fonctionnalité | Reportée à V2 |
|----------------|---------------|
| Transcription vocale (STT) | ✅ |
| Scraping automatique blolab.bj | ✅ |
| Monitoring session WhatsApp | ✅ |
| Prise de contrôle admin (takeover) | ✅ |
| Réponse media (images, docs) | ✅ |

---

## Flux MVP en 5 étapes

```
[Contact WhatsApp] → Envoie un message texte
        ↓
[Webhook /api/webhooks/wasender] → Valide HMAC
        ↓
[RAG Pipeline] → Embedding → pgvector → Gemini → Réponse
        ↓
[Lead Profiler] → Extrait données → UPSERT Profil_Prospects
        ↓
[Score ≥ 80 ?] → Alerte Telegram (lead chaud)
        ↓
[Dashboard] → Inbox + Contacts + Analytics en temps réel
        ↓
[Broadcast] → Admin crée une campagne → envoi groupé rate-limité
```

---

## Stack MVP (réduit)

| Couche | Choix |
|--------|-------|
| Backend | Next.js API Routes |
| Base de données | Supabase (projet `oejsmgyzirwypwvsqymn`) |
| LLM | Gemini 2.0 Flash |
| WhatsApp | WaSenderAPI |
| Frontend | Next.js + Tailwind + Supabase Realtime |
| Hosting | Vercel |

---

## Livraison estimée

| Étape | Durée |
|-------|-------|
| Setup projet Next.js + env | 1h |
| Webhook + dispatch texte | 2h |
| RAG pipeline | 3h |
| Lead profiler + Alertes Telegram | 1h |
| Dashboard Inbox + Contacts | 4h |
| Broadcast / Campagnes | 3h |
| Analytics page | 2h |
| **Total MVP** | **~2 journées de code** |

---

*MVP validé → on itère vers la V2 avec broadcast, STT vocal et scraping automatique.*

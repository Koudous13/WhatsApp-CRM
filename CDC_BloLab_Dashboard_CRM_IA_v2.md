# Cahier des Charges — Dashboard CRM & Agent IA WhatsApp
## BloLab — Hub d'Innovation Digitale

| Champ | Détail |
|---|---|
| **Date** | 26 Février 2026 |
| **Porteur du projet** | BloLab — Cotonou (Zogbohouê) & Parakou, Bénin |
| **Objet** | Plateforme CRM centralisée de gestion des communications WhatsApp assistée par IA |
| **Intégration WhatsApp** | WaSenderAPI (wasenderapi.com) — REST API + Webhooks |
| **Version** | 2.0 — Définition technique complète |

---

## Sommaire

1. [Contexte et Objectifs](#1-contexte-et-objectifs)
2. [Intégration WhatsApp via WaSenderAPI](#2-intégration-whatsapp-via-wasenderapi)
3. [Spécifications Fonctionnelles](#3-spécifications-fonctionnelles)
4. [Spécifications Techniques](#4-spécifications-techniques)
5. [Prochaines Étapes](#5-prochaines-étapes)

---

## 1. Contexte et Objectifs

### 1.1. Présentation de BloLab

BloLab est le premier hub d'innovation digitale et FabLab du Bénin, fondé en 2015 par Médard Agbayazon. ONG à but non lucratif implantée à Zogbohouê (Cotonou) avec une antenne à Parakou, BloLab a pour mission de démocratiser l'accès au numérique et à la fabrication numérique. Le mot « Blo » signifie « faire » en langue Fon, reflétant l'ADN maker du lieu.

BloLab s'articule autour de quatre pôles complémentaires :

- **FabLab** — Premier FabLab du Bénin, équipé d'imprimantes 3D, découpes laser, fraiseuses CNC, outils électroniques et robotiques.
- **Ecole229** — Formations courtes aux métiers du numérique ouvertes aux décrocheurs scolaires, porteurs de projets et professionnels en reconversion. Taux d'insertion de 93%.
- **Incubateur BLO** — Accompagnement à l'entrepreneuriat innovant (formations, mentorat, ateliers, accès aux investisseurs et au financement).
- **BloBus** — Bus numérique itinérant équipé d'une salle de classe, d'un espace coworking et d'un FabLab mobile qui parcourt le Bénin du nord au sud et de l'est à l'ouest.

### 1.2. Problématique

BloLab interagit quotidiennement avec une communauté diversifiée : apprenants, makers, partenaires, entrepreneurs, étudiants, enfants et familles. WhatsApp est le canal de communication privilégié pour ce public. Face au volume croissant des requêtes sur les formations, les équipements, les programmes d'incubation, les déplacements du BloBus et les événements, il devient indispensable de structurer et d'automatiser cette gestion tout en conservant la proximité humaine qui caractérise BloLab.

**Spécificité locale importante :** le public de BloLab est majoritairement béninois et plurilingue. Les échanges se font en français, mais aussi en langues vernaculaires (Fon, Yoruba, Dendi, Bariba, etc.) ou dans un français oral fortement accentué ou non articulé. Tout système automatisé doit tenir compte de cette réalité, en particulier pour le traitement des messages vocaux.

### 1.3. Objectifs principaux

- Centraliser toutes les interactions WhatsApp sur une interface unique (Dashboard) accessible par l'ensemble de l'équipe.
- Automatiser le premier niveau de support grâce à un agent IA nourri par la base de connaissances de blolab.bj.
- Superviser l'IA en temps réel avec la capacité de reprendre la main à tout moment sur n'importe quelle conversation.
- Capitaliser sur les données de la communauté via un CDP (Customer Data Platform) intégré.
- Déployer via WaSenderAPI, solution robuste REST avec webhooks, sans les contraintes de l'API officielle Meta.

---

## 2. Intégration WhatsApp via WaSenderAPI

### 2.1. Présentation de WaSenderAPI

WaSenderAPI (wasenderapi.com) est une API REST complète permettant l'intégration WhatsApp sans passer par l'API officielle Meta. Elle propose une architecture basée sur des sessions persistantes, des webhooks en temps réel et des SDKs officiels TypeScript/JavaScript — parfaitement alignés avec la stack Next.js du projet.

> **Avantage vs bibliothèques open-source (Baileys, whatsapp-web.js)**
> WaSenderAPI externalise la complexité de la connexion WhatsApp : pas de QR code à scanner dans le code, pas de thread Node.js fragile à maintenir. Le service gère la connexion, la résilience et les mises à jour. Notre backend se contente d'appeler une REST API standard et de recevoir des webhooks HTTPS — beaucoup plus stable et maintenable en production.

### 2.2. Architecture de la connexion

**Sessions** — Une session WaSenderAPI représente un numéro WhatsApp lié au système. La connexion se fait via scan QR depuis le dashboard WaSenderAPI, qui génère un Bearer Token stocké en variable d'environnement dans notre backend.

**Réception des messages (Webhooks)** — WaSenderAPI envoie un payload JSON à notre endpoint HTTPS à chaque événement : messages privés entrants, messages de groupe, statuts de livraison (delivered/read), création/modification de chats.

**Envoi de messages (REST API)** — Notre backend envoie des requêtes POST authentifiées via Bearer Token. Types supportés : texte, images, vidéos, documents PDF, audio, stickers, cartes de contact, localisation.

**Gestion des médias entrants** — WaSenderAPI expose un endpoint de déchiffrement des médias. Lorsqu'un utilisateur envoie un fichier, le payload webhook contient les informations de chiffrement (mediaKey + url). Le fichier est accessible pendant 1 heure via une URL temporaire, ce qui impose un stockage immédiat dans Supabase Storage dès la réception du webhook.

### 2.3. Plan de résilience et monitoring

Même avec WaSenderAPI, une session peut se déconnecter (changement de téléphone, expiration). Le dashboard BloLab intègre un monitoring actif :

- **Vérification périodique** — Appel toutes les 5 minutes à l'API WaSenderAPI pour vérifier le statut de la session.
- **Indicateur visuel** — Badge vert/orange/rouge dans le dashboard indiquant l'état de la connexion WhatsApp en temps réel.
- **Alertes automatiques** — Notification email si la session est détectée hors ligne.
- **Reconnexion guidée** — Page dédiée dans le dashboard pour re-scanner le QR Code, sans accès au serveur.
- **Webhook Secret** — Validation de la signature HMAC de chaque payload reçu pour sécuriser les endpoints contre les appels frauduleux.

---

## 3. Spécifications Fonctionnelles

### 3.1. Module de Supervision des Conversations (Inbox & Takeover)

Interface principale de l'équipe BloLab, similaire à une boîte de réception avancée.

#### Interface unifiée (Inbox)

- Architecture 3 colonnes : liste des conversations (gauche), fil de discussion (centre), informations du contact (droite).
- Mise à jour en temps réel via Supabase Realtime : chaque nouveau message webhook est poussé instantanément à tous les onglets ouverts du dashboard.
- Indicateur de présence : badge indiquant quel administrateur est actif sur une conversation donnée.

#### Statuts des conversations

| Statut | Description |
|---|---|
| 🤖 Géré par l'IA | L'agent virtuel répond de manière autonome |
| ⏳ Escalade — Attente humain | L'IA n'a pas pu répondre ou l'utilisateur demande un humain |
| 👤 Assigné à l'équipe | Conversation prise en charge par un administrateur nommé |
| ✅ Résolu | Échange clôturé |
| 🔊 Vocal non transcrit | Message vocal en attente de traitement humain (voir section 3.2) |

#### Système de reprise en main (Manual Takeover)

- Bouton **« Prendre le contrôle »** visible sur chaque conversation active.
- Au clic : le flag `muted = true` est positionné en base. L'IA vérifie ce flag avant toute réponse.
- Système d'assignation : possibilité d'assigner une conversation à un administrateur nommé.
- Notification interne horodatée (invisible pour l'utilisateur) indiquant quel admin a pris le relais et quand.

#### Mode silencieux de l'IA

- Toggle dans la fenêtre de chat : désactiver l'IA pour une durée configurable (1h, 24h, 7 jours) ou définitivement.
- Message de transition automatique au contact lors d'un transfert : *« Je transmets votre demande à l'équipe BloLab. Vous serez pris en charge sous peu. »*
- **Délai SLA configurable** : alerte si une conversation en escalade reste sans réponse humaine au-delà d'un seuil défini (ex. 30 minutes).

---

### 3.2. Gestion des Messages Vocaux

> **Contexte spécifique BloLab** — Le public de BloLab est plurilingue. Les vocaux peuvent être en français, en langues vernaculaires (Fon, Yoruba, Dendi, Bariba…) ou dans un français fortement accentué ou peu articulé. La transcription automatique ne peut donc pas être considérée comme fiable à 100%. Ce module prévoit explicitement les cas de doute et d'échec.

#### Étape 1 — Réception et déclenchement

Dès qu'un message vocal (type `audio` ou `ptt` — Push-to-Talk) est reçu via webhook WaSenderAPI, le système déclenche le pipeline suivant sans attendre d'intervention humaine.

#### Étape 2 — Transcription automatique (best-effort)

Le fichier audio est envoyé à un modèle de transcription (Speech-to-Text). Plusieurs options sont envisagées, évaluées sur leur support du français africain et des langues vernaculaires locales :

| Modèle | Fournisseur | Notes |
|---|---|---|
| Chirp / Chirp 2 | Google Cloud STT | Bon support multilingue, langues africaines en beta |
| Gemini 1.5 Flash (audio) | Google AI | Modèle multimodal, comprend le contexte, envoie directement le fichier audio |
| Whisper large-v3 | OpenAI | Très bon en français, support limité des langues vernaculaires locales |
| Whisper hosted | Groq | Whisper large-v3 via API rapide et peu coûteuse |

Le choix final sera effectué après une phase de tests comparatifs sur des échantillons audio représentatifs du public BloLab (français béninois, Fon, Yoruba, vocaux bruités).

#### Étape 3 — Évaluation du niveau de confiance

Le moteur de transcription renvoie un score de confiance (confidence score). Trois cas sont distingués :

**Cas A — Confiance haute (seuil > 0.80)**
La transcription est considérée comme fiable. Elle est transmise au pipeline RAG de l'IA pour générer une réponse normale. La transcription est affichée dans le fil de conversation du dashboard (avec l'icône 🎙️ pour indiquer l'origine vocale).

**Cas B — Confiance moyenne (seuil entre 0.50 et 0.80)**
La transcription partielle est affichée dans le dashboard avec un badge d'avertissement **« Transcription incertaine »**. L'IA ne répond pas automatiquement. Un administrateur est notifié pour écouter le vocal et décider de la suite. Si aucun admin ne prend en charge sous le délai SLA configuré, un message automatique est envoyé au contact :
*« Nous avons bien reçu votre message vocal. Un membre de notre équipe vous répondra très bientôt. »*

**Cas C — Confiance faible ou échec (seuil < 0.50 ou erreur de transcription)**
La transcription est jugée inexploitable (langue non reconnue, audio trop bruité, mauvaise articulation). L'IA ne tente aucune réponse. La conversation passe automatiquement au statut **🔊 Vocal non transcrit** et remonte en priorité dans l'inbox pour traitement humain. Le même message d'attente est envoyé au contact.

#### Étape 4 — Interface admin pour les vocaux

- Lecteur audio intégré dans le fil de conversation (lecture directement dans le dashboard, sans téléchargement).
- Affichage de la transcription (même partielle) avec son niveau de confiance indiqué visuellement.
- Bouton **« Corriger la transcription »** : l'admin peut corriger le texte manuellement, ce qui est enregistré et peut alimenter la base de connaissances si pertinent.
- Bouton **« Répondre »** : l'admin prend la main et rédige sa réponse textuelle.

#### Considération sur les langues vernaculaires

Si une langue vernaculaire est détectée (le modèle retourne un code langue différent du français), un tag `langue_vernaculaire` est appliqué automatiquement à la conversation. L'équipe BloLab peut ainsi filtrer ces conversations dans l'inbox pour les traiter en priorité avec des agents maîtrisant ces langues.

À terme, il sera possible d'intégrer un modèle spécialisé sur les langues africaines (ex. Kigelia AI, MasakhaNER, ou solutions du projet LACUNA Fund) si les volumes le justifient.

---

### 3.3. Gestion des Autres Types de Médias

- **Images** — Affichage en miniature dans le fil de conversation, téléchargeable. L'IA ne tente pas d'analyser le contenu visuel → escalade automatique si l'image semble être la demande principale.
- **Documents PDF** — Icône + nom de fichier, téléchargement direct. L'IA informe le contact qu'un membre de l'équipe prendra en charge sa demande.
- **Vidéos** — Lecteur natif ou lien de téléchargement. Escalade systématique vers un humain.
- **Tout type non géré** — Message automatique au contact + escalade humaine avec le média visible dans l'interface.

---

### 3.4. Module de Gestion de l'Agent IA

#### Base de connaissances — Scraping automatique de blolab.bj

Le scraper cible les pages suivantes (liste configurable dans le dashboard) :

- `/formations` — Programmes Ecole229, calendriers, prix, conditions d'inscription
- `/fablab` — Équipements disponibles, modalités d'accès, tarifs
- `/incubateur` — Programmes d'accompagnement, critères d'éligibilité
- `/blobus` — Calendrier des déplacements, demande de prestation
- `/projets` — Projets passés et en cours
- `/blog` — Articles récents
- `/contact` — Coordonnées, adresses Cotonou et Parakou

**Processus de mise à jour :**

- Déclenchement manuel via bouton **« Actualiser la base de connaissances »** dans le dashboard, ou automatique (cron hebdomadaire configurable).
- Les pages sont scrapées, le contenu textuel extrait, découpé en chunks (par paragraphe avec overlap), puis transformé en embeddings.
- Stockage dans Supabase pgvector avec métadonnées (`url_source`, `date_scraping`, `section`).
- **Versioning** : chaque scraping crée une nouvelle version. Possibilité de rollback si une mise à jour dégrade le comportement de l'IA.
- Affichage de la date de **dernière mise à jour réussie** dans le dashboard. Alerte si le scraping échoue (site en maintenance, erreur réseau).

#### Éditeur manuel de la base de connaissances

- Interface CRUD : ajouter du texte libre, des paires Q/R (FAQ), ou des documents PDF uploadés (plaquette BloLab 2026, etc.).
- **Playground de test** : barre de recherche pour simuler une question et voir les chunks consultés + la réponse générée — sans envoyer de message réel.

#### Définition des seuils d'escalade

- **Seuil de confiance vectorielle configurable** : si le score de similarité des chunks pgvector est inférieur au seuil (ex. 0.75), l'IA répond *« Je ne dispose pas de cette information, je vous transfère vers l'équipe »* et escalade.
- **Escalade sur mots-clés** : liste configurable de mots déclenchant automatiquement le transfert humain (ex. : « humain », « personne », « parler à quelqu'un », « urgence »).
- **Logs des décisions** : pour chaque réponse IA, enregistrement du message, des chunks consultés avec leur score, du prompt complet et du temps de traitement.
- **Boucle de correction** : si une réponse IA est annotée « incorrecte » par un admin, la bonne réponse peut être ajoutée directement à la FAQ.

#### Sécurité et restrictions (Blacklist)

- Interface d'ajout/suppression de numéros en liste noire.
- Les messages provenant d'un numéro blacklisté ne sont ni traités par l'IA ni stockés en base.

---

### 3.5. Module de Gestion des Contacts (CDP)

#### Création et enrichissement automatique

- Dès qu'un nouveau numéro contacte le système, une fiche contact est créée instantanément.
- Message de bienvenue + recueil du consentement (opt-in) : *« Bonjour ! Je suis l'assistant virtuel de BloLab. En continuant, vous acceptez que vos données soient utilisées pour améliorer notre service. Tapez STOP à tout moment pour vous désinscrire. »*
- L'IA extrait des données au fil de la conversation (nom, prénom, centre d'intérêt, niveau technique) et met à jour la fiche silencieusement.

#### Structure de la fiche contact

| Champ | Type | Description |
|---|---|---|
| `whatsapp_number` | String (PK) | Numéro au format international (+229…) |
| `nom / prenom` | String | Extraits par l'IA ou saisis manuellement |
| `first_contact_at` | Timestamp | Date du premier message |
| `opt_in` | Boolean | Consentement à recevoir des broadcasts |
| `tags` | Array\<String\> | Ex. : Maker, Intéressé_Ecole229, BloBus_Visiteur |
| `langue_vernaculaire` | Boolean | True si un vocal en langue locale a été détecté |
| `centre_interet` | String | Domaine principal (FabLab, IA, Code, Design…) |
| `statut_ai` | Enum | `ai_active`, `muted_temp`, `muted_permanent`, `escalated` |
| `assigned_to` | String (FK) | Administrateur en charge |
| `notes` | Text | Notes libres de l'équipe |

#### Recherche et segmentation

- Filtres classiques : requêtes combinées (tag + date + opt-in + administrateur + langue).
- **Recherche sémantique IA** : barre en langage naturel (ex. *« Personnes ayant posé des questions sur l'impression 3D »*), traduite en requête SQL par le LLM.
- Export CSV / Excel de la base filtrée ou totale.
- Import d'une ancienne base Excel avec déduplication par numéro de téléphone.

---

### 3.6. Module de Diffusion et Ciblage (Broadcast)

#### Création de campagnes

- Éditeur de message avec prévisualisation **« WhatsApp-style »** avant envoi.
- Support du formatage WhatsApp (`*gras*`, `_italique_`, `~barré~`) et ajout de médias.
- Système de **templates réutilisables** (ex. : « Annonce formation », « Rappel événement », « Newsletter mensuelle »).
- Sélection de l'audience via les segments CDP (ex. : `tag = Ecole229 AND opt_in = true`).

#### Planification (Scheduling)

- Rédaction et programmation à une date/heure future.
- Fuseau horaire par défaut : `Africa/Porto-Novo` (WAT, UTC+1).
- File d'attente avec statut visible : En attente / En cours / Envoyé / Erreur.

#### Rapport post-campagne

- Nombre de messages envoyés, livrés (delivered), lus (read).
- Nombre de réponses générées suite au broadcast.
- Taux de désabonnement (STOP reçus) suite à la campagne.

#### Gestion des groupes WhatsApp

- Listing automatique des groupes dont le numéro BloLab fait partie (via WaSenderAPI `GET /api/groups`).
- Possibilité d'envoyer des annonces ciblées dans des groupes sélectionnés.
- **Règle stricte de l'IA dans les groupes** : mode Read-Only par défaut. L'IA ne répond que si elle est mentionnée explicitement (`@BloLabBot`) ou si un mot-clé déclencheur est configuré.

#### Gestion des consentements (Opt-out)

- Mention automatique dans chaque broadcast : *« Répondez STOP pour ne plus recevoir nos annonces. »*
- Détection automatique par l'IA des intentions de désinscription → `opt_in = false`.
- Blocage technique de tout envoi futur vers les contacts `opt_in = false`.

---

### 3.7. Module Analytique

- Volume de messages par période (jour/semaine/mois) : entrants vs sortants.
- **Taux de résolution IA** : % de conversations traitées intégralement par l'IA sans intervention humaine.
- **Taux d'escalade** : % de conversations transférées à un humain, avec les raisons les plus fréquentes.
- **Taux de succès de transcription vocale** : % de vocaux transcrits avec haute confiance vs escalades.
- **Distribution par langue détectée** : français vs langue vernaculaire vs non identifié.
- Temps de réponse moyen : IA vs humain.
- Topics les plus fréquents : thèmes extraits des messages (Ecole229, FabLab, BloBus, etc.).
- Croissance des contacts : courbe d'acquisition de nouveaux numéros.
- Performance des broadcasts : graphiques par campagne.

---

## 4. Spécifications Techniques

### 4.1. Stack technologique

| Couche | Technologie | Rôle |
|---|---|---|
| Frontend | Next.js (React) + Tailwind CSS | Dashboard admin, interface de chat, analytics |
| Backend API | Next.js API Routes | Webhooks WhatsApp, CRUD, logique métier |
| Base de données | Supabase (PostgreSQL) | Contacts, messages, logs, paramètres |
| Temps réel | Supabase Realtime | Push des nouveaux messages au dashboard |
| Recherche vectorielle | Supabase pgvector | Stockage et recherche des embeddings (RAG) |
| Auth admin | Supabase Auth | Connexion sécurisée des administrateurs (JWT) |
| WhatsApp | WaSenderAPI (REST) | Envoi/réception messages, groupes, contacts |
| LLM | GPT-4o-mini ou Gemini 1.5 Flash | Génération de réponses (meilleur ratio coût/perf) |
| Embeddings | OpenAI text-embedding-3-small | Transformation textes et questions en vecteurs |
| **STT (Vocaux)** | **Google Chirp / Gemini audio / Whisper** | **Transcription des vocaux — choix après tests** |
| Jobs asynchrones | BullMQ (Redis) ou Inngest | File de scraping, broadcasts planifiés, logs |
| Hébergement | Vercel + Supabase Cloud (EU) | Infrastructure managée, scalable |

> **Note sur le modèle STT :** le choix définitif sera fait après une phase de tests comparatifs sur des échantillons audio représentatifs (français béninois, Fon, Yoruba, audio bruité). Le système est conçu pour permettre le remplacement du modèle STT sans modifier le reste de l'architecture (interface commune abstraite).

### 4.2. Flux de traitement — Message texte entrant (RAG)

```
Webhook WaSenderAPI (HMAC validé)
        ↓
Vérifications : blacklist ? muted ? groupe sans mention ?
        ↓ (si OK)
Enregistrement en base (contacts + messages)
        ↓
Embedding du message → recherche pgvector
        ↓
Score de similarité OK ?  →  NON → Escalade humaine
        ↓ OUI
Construction du prompt [Système] + [Historique] + [Contexte pgvector] + [Message]
        ↓
Appel LLM → Réponse générée
        ↓
Envoi via WaSenderAPI POST
        ↓
Log async Supabase + Push Realtime dashboard
```

### 4.3. Flux de traitement — Message vocal entrant

```
Webhook WaSenderAPI (type audio/ptt)
        ↓
Déchiffrement + stockage immédiat Supabase Storage (fenêtre 1h)
        ↓
Envoi au modèle STT → transcription + score de confiance
        ↓
Score > 0.80 ?  → OUI → Pipeline RAG normal (réponse IA)
        ↓ NON
Score > 0.50 ?  → OUI → Transcription partielle affichée + alerte admin + message d'attente au contact
        ↓ NON
Score < 0.50 ou échec → Statut "Vocal non transcrit" + escalade prioritaire + message d'attente
        ↓
Tag "langue_vernaculaire" si langue non française détectée
```

### 4.4. Gestion multi-admins

- Chaque administrateur a un compte Supabase Auth avec un rôle (`admin`, `agent`, `lecture_seule`).
- Indicateur de présence en temps réel dans l'inbox : *« Marie est en train de répondre à cette conversation. »*
- Système d'assignation de conversations avec historique des changements.
- Logs d'activité par administrateur consultables dans le dashboard.

### 4.5. Sécurité

- Toutes les routes API du dashboard protégées par JWT Supabase.
- Webhooks WaSenderAPI validés par signature HMAC.
- Clés API (LLM, STT, WaSenderAPI, Supabase) uniquement en variables d'environnement serveur, jamais exposées côté client.
- Hébergement Supabase en région EU recommandé pour conformité RGPD.
- Consentement explicite (opt-in) recueilli à chaque premier contact.

### 4.6. Environnements

- **Production** — Numéro WhatsApp BloLab officiel, base Supabase de production.
- **Staging/Test** — Numéro WhatsApp secondaire dédié aux tests, base Supabase séparée. Permet de tester l'agent IA et le pipeline vocal sans risque d'envoyer des réponses erronées aux vrais contacts.

---

## 5. Prochaines Étapes

| # | Étape | Responsable | Statut |
|---|---|---|---|
| 1 | Validation du présent document par les parties prenantes BloLab | Direction BloLab | À faire |
| 2 | Création du compte WaSenderAPI + test de connexion du numéro WhatsApp BloLab | Tech | À faire |
| 3 | **Phase de tests STT** : collecte d'échantillons audio (français béninois, Fon, Yoruba, audio bruité) et évaluation comparative des modèles (Google Chirp, Gemini audio, Whisper/Groq) | Tech + Équipe BloLab | À faire |
| 4 | Maquettage UI/UX du Dashboard (Figma) : Inbox, gestion des vocaux, fiche contact, analytics | Design / Tech | À faire |
| 5 | Mise en place du socle technique : Next.js + Supabase + WaSenderAPI Webhooks | Tech | À faire |
| 6 | Développement du scraper blolab.bj + pipeline RAG (pgvector) | Tech | À faire |
| 7 | Rédaction du Cahier des Charges de l'Agent IA : System Prompt, personnalité, limites, langues | Direction + Tech | À faire |
| 8 | Développement du pipeline vocal (STT + gestion des niveaux de confiance) | Tech | À faire |
| 9 | Développement du module Broadcast + CDP | Tech | À faire |
| 10 | Tests en environnement staging (numéro de test, échantillons vocaux réels) | Tech + Équipe | À faire |
| 11 | Déploiement en production + formation de l'équipe | Tech + Direction | À faire |

---

*BloLab — Zogbohouê, Cotonou | Parakou | contact@blolab.bj | blolab.bj*
*Document version 2.0 — Février 2026*

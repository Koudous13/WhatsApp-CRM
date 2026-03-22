# Vision Globale : CRM BloLab V2.0 (Le "GOAT" des CRM WhatsApp)

Le MVP a prouvé que la mécanique de base (RAG + Profilage + Closing) fonctionne. L'objectif de la V2.0 n'est plus seulement de "faire le job", mais de créer une **addiction positive** chez l'utilisateur (l'équipe BloLab). Le CRM ne doit plus être un simple outil de consultation, mais un **véritable copilote proactif de vente**.

**Postulat de base :** L'Analytics devient l'interface d'atterrissage principale (`/`). Lorsqu'on se connecte, on ne veut pas voir des messages bruts, mais l'état de santé du business avant tout.

---

## 📊 1. Analytics (La Nouvelle Page d'Accueil Principale)
*L'objectif est de passer d'un simple affichage de chiffres à un tableau de bord décisionnel.*

### Fonctionnalités & UX :
*   **Le "Météo Business" (Morning Briefing) :** En haut de page, un encart généré par l'IA résume la situation du jour.
    *   *Ex : "Bonjour ! Hier a été une excellente journée avec 5 nouveaux leads très chauds pour ClassTech. Attention, 3 prospects attendent une réponse manuelle d'urgence depuis plus de 4h."*
*   **Pipeline Visuel de Conversion (Funnel) :** Un graphique en entonnoir interactif montrant le parcours : `Nouveaux Contacts` -> `Qualifiés` -> `Propositions Faites` -> `Inscrits`. Cliquer sur une étape du funnel filtre automatiquement et affiche un mini-tableau des contacts correspondants en dessous.
*   **Top Objections du Moment :** Un diagramme circulaire ou un nuage de mots-clés montrant les objections les plus fréquentes (Prix, Temps, Distance) des 7 derniers jours. Cela aide l'équipe à ajuster les argumentaires ou le contenu du site web.
*   **Temps de Réponse IA vs Humain :** Un graphique montrant l'efficacité de l'IA. "L'IA a fait gagner 45 heures de travail cette semaine".
*   **KPIs Actionnables :** Les cartes de statistiques ne sont plus passives. Si je clique sur la carte "12 Messages Échoués", ça m'ouvre directement un modal avec la liste des 12 contacts à relancer.

---

## 💬 2. Inbox (Le Centre de Tri Intelligent)
*L'objectif est de réduire le bruit (les conversations gérées par l'IA) et de maximiser l'attention humaine là où ça compte vraiment.*

### Fonctionnalités & UX :
*   **Système d'Onglets Smart Routing :**
    *   Onglet 1 : **"Nécessite Action Humaine"** (Ceux que l'IA ne peut pas gérer ou les leads très chauds).
    *   Onglet 2 : **"En Cours par l'IA"** (Vue fantôme pour surveiller ce que le bot fait).
    *   Onglet 3 : **"Clos"** (Inscriptions terminées).
*   **Indicateur de Température en temps réel :** Sur la liste des conversations (colonne de gauche), chaque chat arbore une pastille (Éclair rouge = Urgent, Flamme = Lead Chaud, Flocon = Froid).
*   **Le "Takeover" (Prise de contrôle) en 1 clic :** Un gros bouton rouge "Prendre le contrôle" dans le chat. S'il est pressé, l'IA est mise en pause *pour ce numéro spécifique*, et un bandeau jaune avertit "⚠️ Vous discutez avec ce prospect. L'IA est en sommeil."
*   **Suggestions d'Assistance Humaine :** Même quand l'humain prend le contrôle, le CRM analyse le message du prospect et suggère 3 boutons de réponse rapide basés sur la base de connaissances (Quick Replies dynamiques).
*   **Aperçu du Profil au Survol :** Dans la liste des conversations, survoler un nom affiche une infobulle stylisée (Tooltip) avec son profil (Programme, Objectif, Score) sans avoir à cliquer.

---

## 👥 3. Contacts (La Mine d'Or)
*L'objectif n'est pas d'avoir un annuaire, mais une machine à faire du ciblage chirurgical pour les futures campagnes.*

### Fonctionnalités & UX :
*   **Filtres Avancés & "Smart Segments" :** Un panneau latéral de filtres ultra-puissant (Filtrer par : Programme recommandé, Score supérieur à 7, Type de profil = Parent). On peut sauvegarder ces recherches sous forme d'onglets personnalisés (Ex: "Onglet : Parents Chauds ClassTech").
*   **Bulk Actions (Actions de masse) Magiques :** Sélectionner plusieurs contacts via des cases à cocher et pouvoir "Créer un segment pour Broadcast" ou "Mettre le statut à Froid" en un clic.
*   **La vue Kanban "Pipeline de Vente" (Synchronisée DB) :** Offrir une alternative à la vue "Liste" classique. Pouvoir afficher les contacts sous forme de colonnes (Nouveau -> Qualifié -> Proposition -> Inscrit) et pouvoir les glisser-déposer (Drag & Drop). **Action Réelle :** Le fait de lâcher la carte dans une nouvelle colonne déclenche un spinner de chargement sur la carte, met à jour le statut dans Supabase instantanément, et affiche un toast de confirmation vert.
*   **Historique Vertical (Timeline) :** Sur la fiche contact, l'historique ne montre pas que les champs actuels, mais la *chronologie* (ex: "Il y a 2 jours : Passage de Nouveau à Qualifié").

---

## 📢 4. Broadcast (Le Sniper Marketing)
*L'objectif est d'arrêter d'arroser tout le monde pour rien et de viser les bons profils.*

### Fonctionnalités & UX :
*   **Ciblage par Intelligence CRM (Hyper-Segmentation) :** Au lieu de juste taper des numéros, on choisit une "Cible" parmi les Smart Segments (ex: Envoyer à "Tous les étudiants intéressés par Ecole229 n'ayant pas validé après 7 jours").
*   **A/B Testing Facilisé :** Pouvoir créer DEUX variantes du message. Le CRM envoie le msg A à 50% de l'audience, le msg B à 50%, et on compare lequel ouvre/répond le plus.
*   **Variabilisation Avancée :** Pouvoir insérer `{Prenom}`, `{Programme_Recommande}`, ou `{Dernière_Objection}` dans le template du message. Le mockup smartphone s'adapte en temps réel avec un faux nom pour montrer le rendu personnalisé.
*   **Planification Intelligente (Schéduling) :** Pouvoir coder un envoi "Demain à 14h00" au lieu d'un envoi immédiat.

---

## 📚 5. Base de Connaissances (Le Cerveau)
*L'objectif est de s'assurer que l'IA sait de quoi elle parle et que les infos soient facilement gérables.*

### Fonctionnalités & UX :
*   **Vue "Testeur d'IA" (Playground Local) :** Un mini-chat intégré directement sur cette page. On tape une question et on voit exactement quelle partie d'un document l'IA utilise pour répondre. S'il dit une bêtise, on sait quel document corriger.
*   **Upload de Fichiers (TXT/Word/PDF) :** L'interface d'ajout ne se limite plus au simple texte. On peut glisser-déposer un fichier Word ou TXT. Le CRM parse le contenu en arrière-plan et l'injecte dans le Vector Store automatiquement.
*   **Gestion et Suppression Réelle :** Sur chaque document dans la grille, un bouton "Corbeille" permet de **supprimer réellement** l'information de la base de données Supabase Vector Store. Le document disparaît avec une belle animation de désintégration.
*   **Tagging / Catégorisation Visuelle :** Pouvoir associer chaque document à une pastille de couleur (ex: Bleu=ClassTech, Vert=Ecole229, Rouge=Règlement Intérieur). La disposition Masonry peut alors être filtrée par ces catégories en un clic au-dessus de la grille.

---

## ✨ 6. Les Micro-Interactions & "L'Expérience GOAT"
*Pour que l'outil soit un plaisir à utiliser au quotidien, il faut soigner les détails invisibles.*

### Fonctionnalités Transversales (UX Pures) :
*   **Command Palette (Menu Magique) :** L'utilisateur presse `Ctrl + K` (ou `Cmd + K`). Une barre de recherche flottante apparaît (façon Spotlight ou Raycast). Il peut taper "Chercher Aminata", "Aller à Analytics", ou "Nouvelle Campagne", et naviguer à la vitesse de l'éclair sans toucher la souris.
*   **Raccourcis Clavier Globaux :** Appuyer sur `C` partout dans l'app ouvre la fenêtre "Nouveau Contact". Appuyer sur `B` ouvre la page Broadcast.
*   **Sound Design (Design Sonore Subtil) :** Un micro-son satisfaisant (très discret, type "pop" grave) se fait entendre lors du passage d'un lead à "Inscrit" ou lors de l'envoi réussi d'un Broadcast. Cela renforce l'idée d'accomplissement (gamification).
*   **Mode "Zen" (Focus) sur l'Inbox :** La possibilité de masquer complètement le menu latéral et la colonne de profil pour n'avoir que le chat pur à l'écran lorsqu'on doit répondre à 50 messages à la suite.
*   **Confettis Virtuels :** Lorsqu'une campagne Broadcast atteint 100% de taux de livraison avec un bon taux de réponse, ou qu'un contact passe en "Inscrit", une légère et élégante animation de confettis s'affiche.

---

## 🎯 Conclusion de l'Analyse
Cette version 2 ne touche pas aux fondations techniques lourdes (pas de gestion de médias, pas de changements d'API), mais elle transforme radicalement la **posture de l'utilisateur**. On passe d'un utilisateur "Spectateur d'un bot" à un "Directeur des ventes augmenté par la data". L'interface`/analytics` en page d'accueil donnera instantanément ce sentiment de "Salle de Contrôle Premium".

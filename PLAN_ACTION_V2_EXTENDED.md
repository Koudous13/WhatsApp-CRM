# 🚀 PLAN D'ACTION CRM BLOLAB V2.0 : L'EXPÉRIENCE "GOAT" (COMPLET)

Ce document est la référence absolue pour l'implémentation de la V2.0. Il intègre TOUTES les spécifications de Vision UX, d'Audit UX et les demandes récentes de flexibilité.

## 1. 📊 DASHBOARD & ANALYTICS (La Tour de Contrôle)
- **Météo Business IA** : Encart de briefing matinal proactif en haut de page.
- **Funnel de Conversion Interactif** : Graphique en entonnoir (Nouveau -> Inscrit) avec filtrage au clic.
- **Top Objections** : Visualisation des freins clients (Prix, Temps, etc.).
- **KPIs Actionnables** : Cliquer sur une statistique (ex: "Messages échoués") ouvre la liste des contacts concernés.
- **Dashboard "Vivant" & Éditable** : 
    - Comparaison Inscrits vs Contactés par programme.
    - **Édition Directe des Chiffres** : Possibilité de modifier les statistiques manuellement depuis l'interface.
- **Sidekick IA Omniprésent** : Agent de veille suggérant des actions (ex: "Relancer X") sur n'importe quelle page.

## 2. 💬 INBOX ++ (Le Centre de Tri Intelligent)
- **Smart Routing (4 Onglets)** : "Action Requise", "IA en cours", "Clos" et **"TOUT"** (Vue globale).
- **Gestion Dynamique des Catégories** : Interface pour ajouter des catégories en base et changer le tag d'une conversation instantanément (Sync Supabase).
- **Takeover Fluide** : Bouton rouge pour mettre l'IA en sommeil sur une discussion précise avec bandeau d'alerte.
- **Quick Replies Dynamiques** : Suggestions de réponses basées sur la base de connaissances même en mode manuel.
- **Mode Zen (Focus)** : Masquage total des menus latéraux pour se concentrer sur le chat.
- **Indicateurs de Température** : Flammes 🔥 pour leads chauds, cristaux ❄️ pour froids.

## 3. 👥 CONTACTS & KANBAN (Gestion de Mines d'Or)
- **Kanban Robuste & Sécurisé** :
    - Vue Colonnes (Nouveau -> Qualifié -> Proposition -> Inscrit).
    - **Verrouillage (Lock)** : Commutateur obligatoire pour activer le Drag & Drop et éviter les erreurs de déplacement.
    - **Synchronisation réelle** : Spinner sur la carte pendant l'update DB, Toast de confirmation vert.
- **Filtres Avancés (Smart Segments)** : Filtrage multi-critères (Score > 7 + Programme X + Pas d'inscription) avec **Sauvegarde de recherche**.
- **Action rapide au survol** : Bouton 💬 pour sauter directement dans l'Inbox.

## 4. 📢 BROADCAST ++ (Le Sniper Marketing)
- **Upload CSV Intelligent** :
    - Import de fichiers clients.
    - **Analyse de colonnes** : Extraction auto des en-têtes.
    - **Tagging Dynamique** : Insertion de n'importe quelle colonne CSV dans le message `{Colonne_X}`.
- **Variantes Infinies & Split Ratio** : Support de N variantes (ex: 10/20/70) pour tests complexes.
- **Variabilisation CRM** : Tags `{Prenom}`, `{Programme}`, `{Derniere_Objection}`.
- **Mockup Smartphone Live** : Rendu visuel WhatsApp en temps réel pendant la rédaction.
- **Planification (Scheduling)** : Programmation précise de la date et de l'heure d'envoi.

## 5. 🤖 AUTOMATISATIONS & WORKFLOWS
- **Workflows J+X** : Séquences d'envoi auto (Inscrit -> +10min "Bienvenue" -> +2J "Espace Membre" -> +7J "Feedback").
- **Prompt d'Inscription Adaptatif** : L'IA détecte l'intention, pose des questions de qualification, puis remplit la table `Inscriptions_Programmes`.

## 📚 6. KNOWLEDGE BASE (Le Cerveau Augmenté)
- **Import "Multi-Source"** :
    - Upload .txt, .docx, .pdf avec parsing automatique.
    - **Scraping de Liens** : Entrer une URL -> Aspiration auto du contenu -> Stockage formaté.
- **Design Accordéon Premium** : Liste centrée, titres arrondis expansibles, rendu Markdown élégant.
- **Gestion Totale** : Boutons Modifier et Supprimer (Suppression physique en base Vector Store).

## ✨ 7. MICRO-INTERACTIONS "GOAT"
- **Command Palette (Ctrl + K)** : Navigation ultra-rapide au clavier.
- **Raccourcis Clavier** : `C` pour Nouveau Contact, `B` pour Broadcast, etc.
- **Sound Design** : Micro-sons discrets de réussite (Inscriptions, Envois).
- **Confettis Emotionnels** : Animation visuelle pour les succès majeurs (Badge 'Inscrit').

## Plan de Vérification
- Validation de l'intégrité de la DB Supabase après chaque action.
- Test de charge sur l'upload CSV (1000+ lignes).
- Audit final du "Feeling" (Fluidité et réactivité < 100ms).

# <img src="icon128.png" width="48" height="48" style="vertical-align: middle; margin-right: 10px;"> Logtime 42 - Extension Chrome Enrichie (Fork)

Une extension Chrome moderne, rapide et ultra-complète pour les étudiants de l'école 42. Ce fork améliore l'expérience originale en ajoutant des fonctionnalités premium directement sur votre profil Intra.

---

## 📋 Sommaire
1. [Installation](#-installation-mode-développeur)
2. [Configuration API](#-configuration-de-lapi-intra-42)
3. [Nouvelles Fonctionnalités Premium](#-nouvelles-fonctionnalités-premium)
4. [Fonctionnalités Classiques](#-fonctionnalités-classiques)
5. [Confidentialité](#-confidentialité)

---

## 🛠️ Installation (Mode Développeur)

1.  **Télécharger le dépôt** : Téléchargez le code en tant qu'archive ZIP et extrayez-le.
2.  **Accéder aux extensions** : Ouvrez Chrome et allez sur `chrome://extensions/`.
3.  **Activer le mode développeur** : Basculez l'interrupteur en haut à droite.
4.  **Charger l'extension** : Cliquez sur **"Charger l'extension non empaquetée"** et sélectionnez le dossier de l'extension.
5.  **Épingler l'extension** : Épinglez "Logtime 42" pour un accès rapide.

---

## 🔑 Configuration de l'API Intra 42

Pour les fonctionnalités avancées (Amis, Outstanding), vous devez configurer vos accès :

1.  Créez une application sur [l'Intra](https://profile.intra.42.fr/oauth/applications/new).
2.  **Redirect URI** : `https://localhost`
3.  Copiez votre **UID** et votre **Secret**.
4.  Ouvrez les **Options** de l'extension et renseignez votre **Login**, **UID** et **Secret**.

---

## ✨ Nouvelles Fonctionnalités Premium

### 📊 Dashboard Profil en Temps Réel
Visualisez instantanément votre logtime du jour et du mois directement en haut de votre profil. Les pastilles s'intègrent parfaitement au design de l'Intra et s'adaptent à vos horaires.

![Header Stats](medias/card_profile_logtime.png)

### 👥 Système d'Amis & Podiums
Une toute nouvelle carte interactive remplace vos "Achievements" pour afficher vos amis :
- **Podiums Interactifs** : Visualisez qui est le "roi" du Logtime ou du Level ce mois-ci.
- **Ajout Rapide** : Ajoutez des amis via une interface simple.
- **Statut Live** : Voyez en un coup d'œil qui est en ligne et sur quel poste.

| Podium Logtime | Podium Level | Ajout Amis |
| :---: | :---: | :---: |
| ![Podium Logtime](medias/card_podium_logtime.png) | ![Podium Level](medias/card_podium_level.png) | ![Add Friend](medias/card_add_Friends.png) |

### 🏅 Décoration Intelligente des Projets (MARKS)
L'extension analyse vos projets et ceux de vos amis pour appliquer des décorations premium :
- **Or ⭐ (Outstanding)** : Détecté automatiquement via l'API pour célébrer l'excellence.
- **Bleu 🏅 (Bonus)** : Appliqué à tous les projets avec un score supérieur à 100.
- **Rouge 🔥 (Ultra)** : Une décoration spéciale pour les projets cumulant à la fois un Bonus > 100 et une distinction Outstanding.

![Project Decorations](medias/card_bonus_outsstanding.png)

### 🖥️ Monitoring Matrix & Live Logtime
Le menu Matrix a été amélioré pour offrir une navigation plus fluide et des informations en temps réel sur l'occupation des clusters et votre session en cours.

![Menu Matrix](medias/menu_matrix.png)

---

## ⚙️ Fonctionnalités Classiques
*   **Planning Personnalisé** : Adaptez vos objectifs quotidiens à votre emploi du temps.
*   **Notifications de Connexion** : Soyez prévenu dès qu'un ami se connecte en cluster.
*   **Calendar Heatmap** : Visualisez votre activité sur l'année.
*   **Matrix View** : Vérifiez l'occupation des clusters en un clic.

---

## 🛡️ Confidentialité
Toutes vos données (clés API, login, amis) sont stockées **localement** dans votre navigateur via `chrome.storage.local`. Aucune donnée n'est envoyée à un serveur tiers.

---

*Amélioré avec passion pour la communauté 42.*

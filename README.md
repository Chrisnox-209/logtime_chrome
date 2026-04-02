# 🚀 Logtime 42 - Chrome Extension

Une extension Chrome moderne, rapide et complète pour les étudiants de l'école 42. Suivez votre **Logtime**, gérez vos **objectifs**, surveillez le statut de vos **amis** et visualisez l'occupation des clusters en un clin d'œil.

![Logo](icon128.png)

---

## 📋 Sommaire
1. [Installation](#️-installation-mode-développeur)
2. [Configuration API](#-configuration-de-lapi-intra-42)
3. [Fonctionnalités](#-fonctionnalités)
    * [Logtime & Objectifs](#️-suivi-du-logtime--objectifs)
    * [Planning](#-planning-personnalisé)
    * [Amis & Notifications](#-gestion-des-amis--notifications)
    * [Visualisation & Outils](#-visualisation--outils)
4. [Confidentialité](#-confidentialité)

---

## 🛠️ Installation (Mode Développeur)

Cette extension n'est pas encore sur le Chrome Web Store. Suivez ces étapes pour l'installer manuellement :

1.  **Cloner le dépôt** :
    ```bash
    git clone https://github.com/elarue/logtime42.git
    ```
2.  **Accéder aux extensions** : Ouvrez Chrome et allez sur `chrome://extensions/`.
3.  **Activer le mode développeur** : Basculez l'interrupteur en haut à droite.
4.  **Charger l'extension** : Cliquez sur **"Charger l'extension non empaquetée"** (Load unpacked) et sélectionnez le dossier `logtime_chrome-main`.
5.  **Épingler l'extension** : N'oubliez pas d'épingler "Logtime 42" à votre barre d'outils pour un accès rapide.

---

## 🔑 Configuration de l'API Intra 42

Pour fonctionner, l'extension nécessite une application OAuth sur l'Intra de 42 :

1.  Rendez-vous sur [https://profile.intra.42.fr/oauth/applications/new](https://profile.intra.42.fr/oauth/applications/new).
2.  Remplissez les champs comme suit :
    *   **Name** : `logtime42`
    *   **Description** : `Extension pour le suivi du logtime et des amis.`
    *   **Redirect URI** : `https://localhost`
3.  Cliquez sur **Submit**.
4.  Copiez votre **UID** (Client ID) et votre **Secret**.
5.  Ouvrez les **Options** de l'extension (clic-droit sur l'icône -> Options) et renseignez :
    *   Votre **Login 42**.
    *   L'**UID** et le **Secret** générés.
6.  Cliquez sur **Sauvegarder** pour valider la connexion.

---

## ✨ Fonctionnalités

### ⏱️ Suivi du Logtime & Objectifs
*   **Dashbord en temps réel** : Visualisez votre logtime du jour et du mois.
*   **Cible Quotidienne** : Calcul précis des heures restantes par jour en fonction de votre planning.
*   **Gift Days** : Déduisez des jours d'objectif (vacances, événements) pour ajuster votre barre de progression.
*   **Freeze Days** : Ajoutez des jours de bonus à votre calcul de Blackhole pour plus de précision.

### 📅 Planning Personnalisé
*   Configurez votre **Weekly Schedule** (jours travaillés) pour que l'extension adapte automatiquement votre objectif quotidien. Plus besoin de calculer de tête !

### 👥 Gestion des Amis & Notifications
*   **Friends List** : Suivez le statut (en ligne/hors-ligne) et la position exacte (ex: `z3r12p4`) de vos amis.
*   **Notifications 🔔** : Activez la cloche pour être prévenu instantanément dès qu'un ami se connecte.
*   **Logtime des Amis** : Gardez un œil sur la progression mensuelle de vos camarades.

### 📊 Visualisation & Outils
*   **Calendar Heatmap** : Une vue thermique pour visualiser votre productivité sur le mois.
*   **Matrix View** : Vérifiez l'occupation des postes dans les clusters sans quitter l'onglet actuel.
*   **Project Tracker** : Affiche votre projet en cours et le temps écoulé depuis le début de la session.
*   **Thème Coalition** : L'interface s'adapte automatiquement aux couleurs de votre coalition (Water, Fire, Earth, Air.).

---

## 🛡️ Confidentialité
Toutes vos données (clés API, login, amis) sont stockées **localement** dans votre navigateur via `chrome.storage.local`. Aucune donnée n'est envoyée à un serveur tiers, à l'exception des requêtes directes à l'API officielle de 42.

---

*Développé par [elarue] pour la communauté 42.*

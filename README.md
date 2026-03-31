# 42 Logtime Dashboard - Chrome Extension 🚀

Une extension Chrome de nouvelle génération, ultra-rapide et optimisée, pour suivre en temps réel ton **Logtime**, ton **Wallet** et voir le statut détaillé de **tes amis au cluster 42**, ainsi que l'occupation des postes sur la **Matrix**.

![Logo](icon128.png)

---

## ✨ Fonctionnalités Principales

- **🕒 Logtime Dynamique :** Visualise ton logtime du jour et du mois, avec la gestion des "Gift days" calculant un ratio mensuel précis (ex: 154h par défaut).
- **🎯 Cible Quotidienne Intelligente :** L'extension prend en compte la configuration de tes "jours ouvrés" pour t'indiquer exactement la charge de travail (Cible/J) qu'il te reste à effectuer chaque jour.
- **🤝 Suivi des Amis & Chargement Progressif ⚡ :** 
  - Statut en ligne/hors-ligne (avec la place précise `e1m1...`), logtime mensuel et photos de profil (Avatars) récupérés via l'API.
  - **Ultra-rapide :** Le chargement se fait _ami par ami_ visuellement (tu verras une icône `🔄...` pendant le rafraîchissement) à la vitesse maximale autorisée par l'API (2 requêtes simultanées toutes les 0,6 secondes), optimisant drastiquement le temps d'attente de la liste.
- **🌐 Intégration Matrix :** Suivi automatique du temps d'utilisation des postes du cluster et intégration visuelle avec la page Matrix de 42 Lyon pour voir facilement les postes libres ou occupés.
- **📊 Calendrier Heatmap :** Un calendrier thermique affichant ton temps de travail par jour pour le mois en cours, visualisant ta productivité d'un coup d'oeil.
- **💾 Mémoire Optimisée :** Le stockage exploite la permission `unlimitedStorage` tout en limitant l'empreinte de la mise en cache (compression logicielle des durées), évitant la saturation de la mémoire interne de Chrome.

---

## ⚡ Installation (Mode Développeur)

Cette extension est distribuée pour l'instant de manière locale (sans passer par le Chrome Web Store), suis ces étapes :

1. Ouvre Chrome (ou Brave/Edge/Arc).
2. Va sur la page de gestion des extensions : `chrome://extensions/`
3. Active le **Mode développeur** (interrupteur en haut à droite).
4. Clique sur **Charger l'extension non empaquetée** (Load unpacked).
5. Sélectionne le dossier de l'extension.
6. C'est fait ! N'oublie pas d'épingler l'extension "42 Dashboard" à ta barre de tâches avec l'icône de puzzle.

---

## 🔑 Configuration & Clé d'API 42

Pour que l'extension accède à tes données publiques sur l'Intra de 42, tu dois lui assigner une application OAuth :

1. Rends-toi sur 👉 [https://profile.intra.42.fr/oauth/applications/new](https://profile.intra.42.fr/oauth/applications/new)
2. Remplis le formulaire de création :
   - **Name :** Chrome Logtime Dashboard (ou comme tu veux)
   - **Redirect URI :** `http://localhost`
   - **Scopes :** Coche uniquement `public`
3. Clique sur Submit.
4. Fais un **Clic-droit** sur l'icône de l'extension (la jauge circulaire) -> Clique sur **Paramètres / Options**.
5. Rentre ton **Login 42**, l'**UID** (Client ID) et le **Secret** qui viennent de t'être générés. Configures-y également tes Gift Days, tes jours ouvrés et les logins de la liste d'amis que tu souhaites suivre.
6. Clique sur **Sauvegarder** (Le badge "Paramètres validés" s'assurera que l'API OAuth communique correctement !).

---

## 🔒 Confidentialité & Sécurité

- **Totalement Privé :** Toutes tes données (logins, amis, paramètres API, statistiques) sont stockées dans le coffre-fort local et sécurisé de ton navigateur (`chrome.storage.local`).
- **Aucun Tiers :** Aucun serveur ou outil tiers ne collecte ton activité, l'extension tourne 100% en local et contacte uniquement l'API officielle de 42.

*(Créée par [elarue] / Convertie et Optimisée pour Google Chrome)*

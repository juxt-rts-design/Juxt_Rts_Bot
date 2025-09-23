# Documentation d'Aquila Bot

Aquila Bot est un bot WhatsApp développé avec Node.js, Baileys et Gemini AI, offrant des fonctionnalités interactives telles que la conversion de médias, le téléchargement de vidéos YouTube, la recherche Google et des réponses alimentées par l'IA. Cette documentation explique comment utiliser et déployer le bot sur Render.

## Table des matières
- [Fonctionnalités](#fonctionnalités)
- [Prérequis](#prérequis)
- [Installation](#installation)
- [Configuration](#configuration)
- [Utilisation](#utilisation)
  - [Commandes](#commandes)
  - [Interaction avec l'IA](#interaction-avec-lia)
- [Déploiement sur Render](#déploiement-sur-render)
- [Dépannage](#dépannage)
- [Licence](#licence)

## Fonctionnalités
- **Réponses IA** : Propulsé par Gemini AI, répond aux messages texte et vocaux avec des réponses intelligentes.
- **Conversion de médias** : Convertit des images/vidéos en stickers, des stickers en images/vidéos.
- **Téléchargement de statuts** : Télécharge les statuts WhatsApp (images ou vidéos).
- **Téléchargement YouTube** : Télécharge des vidéos YouTube avec audio.
- **Recherche Google** : Effectue des recherches de texte et d'images via Google.
- **Contact du créateur** : Partage les coordonnées du créateur.
- **Menu** : Affiche un menu avec une image ou un GIF.

## Prérequis
- **Node.js** (v16 ou supérieur)
- **FFmpeg** (pour la conversion de médias et les téléchargements YouTube)
- **Compte WhatsApp** (pour scanner le QR code pour l'authentification)
- **Clé API Gemini** (pour les fonctionnalités IA et text-to-speech)
- **Connexion Internet** (pour les appels API et les téléchargements de médias)
- **Dépendances** (listées dans `package.json`) :
  - `axios`
  - `baileys`
  - `dotenv`
  - `express`
  - `googlethis`
  - `pino`
  - `qrcode`
  - `ytdl-core`

## Installation
1. **Cloner le dépôt** :
   ```bash
   git clone <url-du-dépôt>
   cd whatsapp-bot-gemini
   ```

2. **Installer les dépendances** :
   ```bash
   npm install
   ```

3. **Installer FFmpeg** :
   - **Ubuntu/Debian** :
     ```bash
     sudo apt update
     sudo apt install ffmpeg
     ```
   - **Windows** : Téléchargez depuis [le site FFmpeg](https://ffmpeg.org/download.html) et ajoutez-le au PATH.
   - **macOS** :
     ```bash
     brew install ffmpeg
     ```

4. **Configurer les variables d'environnement** :
   Créez un fichier `.env` à la racine du projet :
   ```env
   GEMINI_API_KEY=votre_clé_api_gemini
   SESSION_DIR=./auth_info
   PORT=3000
   ```
   - Obtenez une clé API Gemini via [Google Cloud Console](https://cloud.google.com/).
   - `SESSION_DIR` stocke les données d'authentification WhatsApp.
   - `PORT` est le port du serveur (par défaut : 3000).

5. **Préparer les fichiers média** :
   - Placez `menu.jpg` dans le dossier `images/` pour la commande `-help`.
   - Placez `menu.mp4` dans le dossier `videos/` pour la commande `-menu`.
   - Créez ces dossiers si nécessaire :
     ```bash
     mkdir images videos
     ```

## Configuration
- **Clé API Gemini** : Assurez-vous que `GEMINI_API_KEY` est valide et a accès au modèle Gemini 1.5 Flash et à l'API Google Text-to-Speech.
- **Dossier de session** : Le dossier `auth_info` stocke les données de session WhatsApp. Assurez-vous qu'il est accessible en écriture.
- **Contact du créateur** : Modifiez `CREATOR_CONTACT` dans le code (`+241066813542@s.whatsapp.net`) si nécessaire.
- **Préfixe** : Le préfixe par défaut des commandes est `-`. Modifiez `PREFIX` dans le code pour le changer.
- **Mots interdits** : Le bot filtre les messages contenant des mots comme "insulte", "offensive" ou "inapproprié". Modifiez `forbiddenWords` dans le code pour personnaliser.

## Utilisation

### Démarrer le bot
Lancez le bot avec :
```bash
npm start
```
Ou, pour le développement avec redémarrage automatique :
```bash
npx nodemon server.js
```

Lors du premier lancement, un QR code apparaît dans le terminal. Scannez-le avec votre compte WhatsApp (Paramètres > Appareils connectés > Connecter un appareil). Le bot se connecte et affiche "Connecté à WhatsApp !".

### Commandes
Utilisez le préfixe `-` pour les commandes. Dans les groupes, mentionnez `@AquilaBot` ou répondez au bot pour les réponses IA. Liste des commandes :

| Commande          | Description                                                                 |
|-------------------|-----------------------------------------------------------------------------|
| `-help`           | Affiche le menu avec une image.                                             |
| `-menu`           | Affiche le menu avec un GIF.                                                |
| `-info`           | Affiche les informations du bot.                                            |
| `-sticker`        | Convertit une image ou vidéo courte (< 8s) citée en sticker (animé pour les vidéos). |
| `-image`          | Convertit un sticker cité en image.                                         |
| `-video`          | Convertit un sticker animé cité en vidéo.                                   |
| `-download`       | Télécharge un statut (image ou vidéo) cité.                                 |
| `-yt <url>`       | Télécharge une vidéo YouTube avec audio.                                    |
| `-find <requête>` | Recherche sur Google et renvoie le premier résultat.                        |
| `-gimage <requête>` | Recherche une image sur Google et l'envoie.                               |
| `-creator`        | Partage les coordonnées du créateur.                                       |

### Interaction avec l'IA
- **Messages texte** : Envoyez un message sans préfixe (ex. : "Quelle est la capitale de la France ?") pour une réponse IA via Gemini.
- **Messages vocaux** : Envoyez une note vocale. Le bot la transcrit avec Gemini et répond par texte ou note vocale (en français, voix neutre).
- **Groupes** : Mentionnez `@AquilaBot` ou répondez à son message pour les réponses IA. Les notes vocales dans les groupes nécessitent une mention ou une réponse au bot.

### Exemple d'utilisation
- Pour convertir une image en sticker :
  1. Envoyez ou citez une image.
  2. Répondez avec `-sticker`.
- Pour télécharger une vidéo YouTube :
  ```text
  -yt https://www.youtube.com/watch?v=exemple
  ```
- Pour poser une question :
  ```text
  2 + 2 = ?
  ```
  Ou envoyez une note vocale avec la question.

## Déploiement sur Render

1. **Créer un compte Render** :
   - Inscrivez-vous sur [Render](https://render.com/).

2. **Créer un nouveau service** :
   - Dans le tableau de bord Render, cliquez sur **New > Web Service**.
   - Connectez votre dépôt Git (GitHub, GitLab, etc.) contenant le code du bot.

3. **Configurer le service** :
   - **Nom** : Donnez un nom à votre service (ex. : `aquila-bot`).
   - **Environnement** : Sélectionnez **Node**.
   - **Commande de démarrage** : Définissez-la sur :
     ```bash
     npm start
     ```
   - **Build Command** : Définissez-la sur :
     ```bash
     npm install
     ```

4. **Ajouter FFmpeg** :
   - Render ne fournit pas FFmpeg par défaut. Ajoutez un script de construction pour l'installer :
     - Créez un fichier `render.yaml` à la racine du projet :
       ```yaml
       services:
         - type: web
           name: aquila-bot
           env: node
           plan: free
           buildCommand: |
             npm install
             apt-get update && apt-get install -y ffmpeg
           startCommand: npm start
           envVars:
             - key: GEMINI_API_KEY
               sync: false
             - key: SESSION_DIR
               value: ./auth_info
             - key: PORT
               value: 3000
       ```
   - Poussez ce fichier vers votre dépôt.

5. **Configurer les variables d'environnement** :
   - Dans le tableau de bord Render, allez dans l'onglet **Environment**.
   - Ajoutez les variables suivantes :
     - `GEMINI_API_KEY` : Votre clé API Gemini.
     - `SESSION_DIR` : `./auth_info`.
     - `PORT` : `3000`.

6. **Téléverser les fichiers média** :
   - Assurez-vous que `menu.jpg` et `menu.mp4` sont dans les dossiers `images/` et `videos/` de votre dépôt.
   - Poussez ces fichiers vers votre dépôt Git :
     ```bash
     git add images/menu.jpg videos/menu.mp4
     git commit -m "Ajout des fichiers média"
     git push
     ```

7. **Déployer** :
   - Poussez les modifications vers votre dépôt Git.
   - Render détecte automatiquement les changements et déploie le service.
   - Consultez les logs dans le tableau de bord Render pour voir le QR code lors du premier lancement.

8. **Authentification** :
   - Lors du premier démarrage, un QR code apparaît dans les logs Render. Scannez-le avec votre compte WhatsApp (Paramètres > Appareils connectés > Connecter un appareil).
   - Les données de session sont stockées dans `auth_info` pour les redémarrages ultérieurs.

9. **Maintenir le bot en ligne** :
   - Le bot envoie un message au créateur toutes les 10 minutes pour confirmer qu'il est en ligne.
   - Configurez un service comme [UptimeRobot](https://uptimerobot.com/) pour ping l'URL de votre service Render (ex. : `https://votre-service.onrender.com/`) toutes les 5 minutes afin d'éviter la mise en veille sur le plan gratuit.

## Dépannage
- **QR Code non affiché** : Vérifiez que `qrcode` est installé et que les logs Render sont accessibles. Vérifiez les erreurs dans les logs de construction.
- **Erreurs FFmpeg** : Assurez-vous que FFmpeg est installé via le script `render.yaml`. Testez avec `ffmpeg -version` dans un terminal.
- **Erreurs API Gemini** :
  - **429 Quota dépassé** : Vérifiez le quota de votre clé API Gemini dans Google Cloud Console.
  - **Clé invalide** : Assurez-vous que `GEMINI_API_KEY` est correcte.
- **Échec de conversion de médias** : Vérifiez que `menu.jpg` et `menu.mp4` sont dans les bons dossiers. Assurez-vous que les vidéos durent moins de 8 secondes pour les stickers.
- **Bot ne répond pas dans les groupes** : Assurez-vous de mentionner `@AquilaBot` ou de répondre à son message.
- **Problèmes de connexion** : Supprimez le dossier `auth_info` sur Render (via un accès shell ou en redéployant) et rescanner le QR code si le bot se déconnecte.

## Licence
Ce projet est sous licence ISC. Voir `package.json` pour plus de détails.#   J u x t _ R t s _ B o t  
 
# 🌐 Guide de l'Interface Web JUXT_RTS Bot

## 🚀 Introduction

L'interface web JUXT_RTS Bot vous permet de gérer les sessions WhatsApp de manière intuitive et moderne, sans avoir à utiliser la ligne de commande.

## 📋 Prérequis

- Node.js 16+ installé
- Bot JUXT_RTS configuré
- Navigateur web moderne

## 🛠️ Installation Rapide

### Option 1 : Script automatique (Recommandé)

```bash
# Toutes plateformes
npm run web
```

### Option 2 : Installation manuelle

```bash
# 1. Installer les dépendances de l'interface
npm run web:install

# 2. Démarrer l'interface
npm run web:start
```

## 🌐 Utilisation

### 1. Accès à l'interface

Ouvrez votre navigateur et allez sur : **http://localhost:3000**

### 2. Méthodes de connexion

#### 🔲 QR Code (Recommandé)
1. Cliquez sur "QR Code"
2. Scannez le QR Code avec WhatsApp
3. Attendez la connexion

#### 📱 Code de liaison
1. Cliquez sur "Code de liaison"
2. Entrez votre numéro de téléphone
3. Cliquez sur "Valider"
4. Entrez le code dans WhatsApp

#### 🔧 Session personnalisée
1. Cochez "Utiliser une session personnalisée"
2. Entrez un ID de session unique
3. Choisissez votre méthode de connexion

### 3. Démarrage du bot

Une fois connecté à WhatsApp :
1. Cliquez sur "Démarrer le Bot"
2. Le bot sera lancé automatiquement
3. Vous verrez le statut de connexion

## 🎨 Interface

### Écran principal
- **Logo** : Logo du bot JUXT_RTS
- **Options** : Session personnalisée, méthodes de connexion
- **Zone d'affichage** : QR Code, codes de liaison, statut
- **Boutons** : Connexion, réinitialisation, démarrage

### États de connexion
- 🔴 **Déconnecté** : Aucune connexion
- 🟡 **Connexion** : En cours de connexion
- 🟢 **Connecté** : Connecté à WhatsApp
- ❌ **Erreur** : Erreur de connexion

## 🔧 Configuration

### Variables d'environnement

Créez un fichier `.env` dans `web-interface/` :

```env
PORT=3000
BOT_PATH=../bot_with_fallback.js
SESSION_DIR=../auth_info
```

### Personnalisation

- **Couleurs** : Modifiez les variables CSS dans `index.html`
- **Port** : Changez la variable `PORT` dans `server.js`
- **Bot** : Modifiez le chemin vers le bot dans `server.js`

## 📱 Fonctionnalités

### Gestion des sessions
- **Création automatique** : Sessions générées automatiquement
- **Sessions personnalisées** : Utilisez vos propres IDs
- **Validation** : Vérification des sessions en temps réel
- **Persistance** : Sessions sauvegardées

### Communication temps réel
- **WebSocket** : Communication instantanée
- **Mises à jour** : Statut en temps réel
- **Notifications** : Alertes de connexion/déconnexion

### Contrôle du bot
- **Démarrage** : Lancement du bot via l'interface
- **Arrêt** : Arrêt propre du bot
- **Monitoring** : Surveillance de l'état du bot

## 🐛 Dépannage

### Problèmes courants

#### Port déjà utilisé
```bash
# Changer le port dans server.js
const port = process.env.PORT || 3001;
```

#### Dépendances manquantes
```bash
cd web-interface
npm install
```

#### Bot ne démarre pas
- Vérifiez que `bot_with_fallback.js` existe
- Vérifiez les permissions d'exécution
- Vérifiez les logs dans la console

#### WebSocket ne se connecte pas
- Vérifiez que le port est ouvert
- Vérifiez les paramètres de proxy/firewall
- Vérifiez les logs du serveur

### Logs et débogage

Les logs sont affichés dans la console :
- `Client connecté` : Nouveau client WebSocket
- `Message reçu` : Messages des clients
- `Bot stdout/stderr` : Logs du bot

## 🔒 Sécurité

### Accès local
- Interface accessible localement par défaut
- Pas d'accès externe sans configuration

### Accès distant
- Configurez un proxy inverse (nginx)
- Utilisez HTTPS en production
- Limitez l'accès par IP si nécessaire

## 📊 API

### WebSocket Messages

#### Messages reçus
```javascript
// QR Code généré
{ "type": "qrcode", "data": "data:image/png;base64,..." }

// Code de liaison généré
{ "type": "pairing", "data": "ABC123" }

// Session créée
{ "type": "session", "session": "session_1234567890_abc123" }

// Connexion établie
{ "type": "connected" }

// Bot démarré
{ "type": "bot_started" }

// Erreur
{ "type": "error", "message": "Message d'erreur" }
```

#### Messages envoyés
```javascript
// Demander un QR Code
{ "type": "request", "content": "qrcode", "data": { "customSession": "session_id_optional" } }

// Demander un code de liaison
{ "type": "request", "content": "pairing", "data": { "phoneNumber": "241123456789", "customSession": "session_id_optional" } }

// Valider une session
{ "type": "validate_session", "sessionId": "session_1234567890_abc123" }

// Démarrer le bot
{ "type": "start_bot" }
```

## 🚀 Scripts disponibles

```bash
# Démarrer l'interface web
npm run web

# Démarrer l'interface web directement
npm run web:start

# Installer les dépendances de l'interface
npm run web:install

# Mode développement
npm run web:dev
```

## 📁 Structure des fichiers

```
web-interface/
├── index.html              # Interface utilisateur
├── server.js               # Serveur WebSocket
├── package.json            # Dépendances
├── README.md              # Documentation
├── config.example.env     # Configuration exemple
└── logs/                  # Logs (créé automatiquement)
```

## 🤝 Support

Pour toute question ou problème :
- **Créateur** : ELLA ASSOUMOU Juste Renaric
- **Contact** : +241076234942
- **Email** : [Votre email]

## 📄 Licence

MIT License - Voir le fichier LICENSE pour plus de détails.

---

## 🎯 Prochaines étapes

1. **Testez l'interface** : Démarrez l'interface et testez les connexions
2. **Configurez** : Personnalisez selon vos besoins
3. **Déployez** : Mettez en production si nécessaire
4. **Partagez** : Partagez avec votre équipe

**Bon développement ! 🚀**

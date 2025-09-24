# JUXT_RTS Bot - Interface Web

Interface web moderne pour gérer les sessions WhatsApp du bot JUXT_RTS.

## 🚀 Fonctionnalités

- **Connexion QR Code** : Scannez le QR Code avec WhatsApp
- **Connexion par numéro** : Entrez votre numéro pour recevoir un code de liaison
- **Gestion des sessions** : Utilisez des sessions personnalisées
- **Interface temps réel** : Communication WebSocket pour les mises à jour instantanées
- **Démarrage/Arrêt du bot** : Contrôle complet du bot via l'interface

## 📋 Prérequis

- Node.js 16+ 
- npm ou yarn
- Bot JUXT_RTS configuré

## 🛠️ Installation

1. **Installer les dépendances** :
```bash
cd web-interface
npm install
```

2. **Démarrer l'interface** :
```bash
npm start
```

3. **Ou utiliser le script principal** :
```bash
# Depuis la racine du projet
node start-web.js
```

## 🌐 Utilisation

1. **Accédez à l'interface** : http://localhost:3000

2. **Choisissez votre méthode de connexion** :
   - **QR Code** : Pour une connexion rapide
   - **Code de liaison** : Pour une connexion par numéro

3. **Optionnel - Session personnalisée** :
   - Cochez "Utiliser une session personnalisée"
   - Entrez un ID de session unique

4. **Connectez-vous** :
   - Scannez le QR Code avec WhatsApp
   - Ou entrez le code de liaison dans WhatsApp

5. **Démarrez le bot** :
   - Une fois connecté, cliquez sur "Démarrer le Bot"

## 🔧 Configuration

### Variables d'environnement

Créez un fichier `.env` dans le dossier `web-interface` :

```env
PORT=3000
BOT_PATH=../bot_with_fallback.js
SESSION_DIR=../auth_info
```

### Personnalisation

- **Couleurs** : Modifiez les variables CSS dans `index.html`
- **Port** : Changez la variable `PORT` dans `server.js`
- **Bot** : Modifiez le chemin vers le bot dans `server.js`

## 📱 Interface

### Écran principal
- Logo et titre du bot
- Options de session personnalisée
- Boutons de connexion (QR Code / Code de liaison)
- Zone d'affichage des codes/QR
- Statut de connexion en temps réel

### États de connexion
- 🔴 **Déconnecté** : Aucune connexion
- 🟡 **Connexion** : En cours de connexion
- 🟢 **Connecté** : Connecté à WhatsApp
- ❌ **Erreur** : Erreur de connexion

## 🔌 API WebSocket

### Messages reçus

```javascript
// QR Code généré
{
  "type": "qrcode",
  "data": "data:image/png;base64,..."
}

// Code de liaison généré
{
  "type": "pairing",
  "data": "ABC123"
}

// Session créée
{
  "type": "session",
  "session": "session_1234567890_abc123"
}

// Connexion établie
{
  "type": "connected"
}

// Bot démarré
{
  "type": "bot_started"
}

// Erreur
{
  "type": "error",
  "message": "Message d'erreur"
}
```

### Messages envoyés

```javascript
// Demander un QR Code
{
  "type": "request",
  "content": "qrcode",
  "data": {
    "customSession": "session_id_optional"
  }
}

// Demander un code de liaison
{
  "type": "request",
  "content": "pairing",
  "data": {
    "phoneNumber": "241123456789",
    "customSession": "session_id_optional"
  }
}

// Valider une session
{
  "type": "validate_session",
  "sessionId": "session_1234567890_abc123"
}

// Démarrer le bot
{
  "type": "start_bot"
}

// Annuler l'opération
{
  "type": "cancel"
}
```

## 🐛 Dépannage

### Problèmes courants

1. **Port déjà utilisé** :
   ```bash
   # Changer le port dans server.js
   const port = process.env.PORT || 3001;
   ```

2. **Dépendances manquantes** :
   ```bash
   cd web-interface
   npm install
   ```

3. **Bot ne démarre pas** :
   - Vérifiez que `bot_with_fallback.js` existe
   - Vérifiez les permissions d'exécution

4. **WebSocket ne se connecte pas** :
   - Vérifiez que le port est ouvert
   - Vérifiez les paramètres de proxy/firewall

### Logs

Les logs sont affichés dans la console :
- `Client connecté` : Nouveau client WebSocket
- `Message reçu` : Messages des clients
- `Bot stdout/stderr` : Logs du bot

## 🔒 Sécurité

- L'interface est accessible localement par défaut
- Pour un accès distant, configurez un proxy inverse (nginx)
- Utilisez HTTPS en production
- Limitez l'accès par IP si nécessaire

## 📝 Développement

### Structure des fichiers

```
web-interface/
├── index.html          # Interface utilisateur
├── server.js           # Serveur WebSocket
├── package.json        # Dépendances
└── README.md          # Documentation
```

### Ajouter de nouvelles fonctionnalités

1. **Côté client** : Modifiez `index.html`
2. **Côté serveur** : Modifiez `server.js`
3. **Communication** : Utilisez les messages WebSocket

## 🤝 Support

Pour toute question ou problème :
- Créateur : ELLA ASSOUMOU Juste Renaric
- Contact : +241076234942
- Email : [Votre email]

## 📄 Licence

MIT License - Voir le fichier LICENSE pour plus de détails.

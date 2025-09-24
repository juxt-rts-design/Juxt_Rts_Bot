# 🚀 Déploiement sur Render.com

## 📋 Prérequis

1. **Compte Render.com** (gratuit)
2. **Repository GitHub** avec ton code
3. **Clé API Gemini** (obligatoire)

## 🔧 Configuration

### 1. Variables d'environnement sur Render

Dans ton dashboard Render, ajoute ces variables :

```
NODE_ENV=production
PORT=3000
GEMINI_API_KEY=ta_cle_gemini_ici
CREATOR_CONTACT=+241065255707@s.whatsapp.net
SESSION_DIR=./auth_info
```

### 2. Configuration du service

- **Type** : Web Service
- **Plan** : Free
- **Build Command** : `npm install`
- **Start Command** : `npm start`
- **Node Version** : 18.x

## 📁 Structure des fichiers

```
Bot_1/
├── start-render.js          # Point d'entrée pour Render
├── render.yaml             # Configuration Render
├── web-interface/          # Interface web
│   ├── server.js
│   └── index.html
├── bot_with_fallback.js    # Bot principal
└── package.json
```

## 🔄 Gestion des sessions

### ✅ **Sessions persistantes**

- Les sessions WhatsApp sont sauvegardées dans `auth_info/`
- Render utilise un disque persistant pour conserver les sessions
- **Ta session actuelle sera conservée** après le déploiement

### 📱 **Connexion après déploiement**

1. Va sur l'URL de ton bot Render
2. Scanne le QR code avec ton téléphone
3. Ta session sera automatiquement sauvegardée
4. Le bot redémarrera automatiquement si nécessaire

## 🚨 **Points importants**

### ⚠️ **Limitations Render Free**

- **Sleep mode** : Le bot s'endort après 15 min d'inactivité
- **Redémarrage** : Peut redémarrer automatiquement
- **Sessions** : Conservées grâce au disque persistant

### 🔧 **Solutions**

1. **Ping automatique** : Le bot se réveille automatiquement
2. **Sessions persistantes** : Pas besoin de re-scanner le QR
3. **Interface web** : Accès 24/7 via l'URL Render

## 📞 **Support**

Si tu as des problèmes :
1. Vérifie les logs dans Render Dashboard
2. Assure-toi que `GEMINI_API_KEY` est configurée
3. Vérifie que le port 3000 est ouvert

## 🎯 **URL finale**

Ton bot sera accessible sur :
`https://ton-bot-name.onrender.com`

L'interface web te permettra de gérer les sessions et le bot !

# Guide de Résolution des Problèmes - JUXT_RTS Bot

## Problèmes de Session et Reconnexions en Boucle

### 🚨 Symptômes
- Erreurs "Bad MAC" dans les logs
- Code d'erreur 515 "Stream Errored (restart required)"
- Reconnexions automatiques en boucle infinie
- Bot qui ne répond pas aux messages

### 🔧 Solutions Implémentées

#### 1. Détection des Sessions Corrompues
Le système détecte maintenant automatiquement les sessions corrompues :
- **Bad MAC errors** : Erreurs de corruption des données de session
- **Code 515** : WhatsApp force une reconnexion
- **Session errors** : Problèmes de validation de session

#### 2. Nettoyage Automatique
Quand une session corrompue est détectée :
- ✅ Suppression de la session de la mémoire
- ✅ Suppression du dossier de session du disque
- ✅ Arrêt du processus bot
- ✅ Message d'erreur à l'utilisateur

#### 3. Prévention des Boucles Infinies
- ⏰ Délai de reconnexion augmenté à 5 secondes
- 🛑 Arrêt automatique en cas de session corrompue
- 🔄 Reconnexion seulement pour les erreurs temporaires

### 🚀 Endpoint de Santé
Nouvel endpoint `/health` pour :
- Vérifier l'état du bot
- Compter les sessions actives
- Surveiller l'uptime
- Empêcher le bot de s'endormir sur Render

### 📊 Monitoring
Script `keep-alive.js` pour :
- Ping périodique du bot (toutes les 10 minutes)
- Réveil automatique si le bot s'endort
- Surveillance de l'état des sessions

## 🛠️ Actions Manuelles

### Si le Bot Ne Répond Toujours Pas

1. **Vérifier les Logs Render**
   ```bash
   # Dans le dashboard Render, section "Logs"
   # Chercher les erreurs "Bad MAC" ou "515"
   ```

2. **Réinitialiser la Session**
   - Aller sur l'interface web du bot
   - Cliquer sur "Réinitialiser"
   - Générer un nouveau QR Code
   - Se reconnecter avec WhatsApp

3. **Nettoyer les Sessions Corrompues**
   ```bash
   # Sur Render, dans la console
   rm -rf /opt/render/project/src/auth_info/*
   ```

4. **Redémarrer le Service**
   - Dans le dashboard Render
   - Cliquer sur "Manual Deploy" → "Deploy latest commit"

### 🔍 Diagnostic

#### Vérifier l'État du Bot
```bash
curl https://juxt-rts-bot.onrender.com/health
```

Réponse attendue :
```json
{
  "status": "healthy",
  "timestamp": "2025-01-24T10:30:00.000Z",
  "activeSessions": 1,
  "botRunning": true,
  "uptime": 3600
}
```

#### Logs à Surveiller
- ✅ `✅ Connecté à WhatsApp !` - Connexion réussie
- ❌ `🚨 Session corrompue détectée` - Session à nettoyer
- 🔄 `🔄 Tentative de reconnexion` - Reconnexion normale
- 🛑 `🛑 Arrêt du bot pour éviter les boucles` - Protection activée

## 📱 Utilisation du Script de Monitoring

### Local (pour tester)
```bash
node keep-alive.js
```

### Sur un Serveur Externe
```bash
# Installer les dépendances
npm install axios

# Lancer le monitoring
node keep-alive.js
```

### Avec PM2 (recommandé)
```bash
# Installer PM2
npm install -g pm2

# Lancer le monitoring
pm2 start keep-alive.js --name "bot-monitor"

# Voir les logs
pm2 logs bot-monitor
```

## 🎯 Prévention

### Variables d'Environnement Importantes
```env
GEMINI_API_KEY=your_api_key_here
CREATOR_CONTACT=+241xxxxxxxxx@s.whatsapp.net
SESSION_DIR=/opt/render/project/src/auth_info
```

### Configuration Render
- ✅ Disque persistant configuré pour `auth_info`
- ✅ Variables d'environnement définies
- ✅ Health check path : `/health`

## 📞 Support

Si les problèmes persistent :
1. Vérifier les logs Render
2. Tester l'endpoint `/health`
3. Réinitialiser complètement la session
4. Redéployer le service

---

**Note** : Ces améliorations devraient considérablement réduire les problèmes de reconnexion en boucle et améliorer la stabilité du bot sur Render.

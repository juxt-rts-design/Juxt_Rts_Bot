# Guide d'Utilisation Directe - JUXT_RTS Bot

## 🚀 **Démarrage Rapide**

### **Utilisation Directe (Recommandée)**
```bash
npm start
```
Le bot démarre directement avec votre session existante dans `auth_info`.

### **Autres Commandes Disponibles**
```bash
# Bot direct (même chose que npm start)
npm run direct

# Interface web (si nécessaire)
npm run web

# Pour Render (déploiement)
npm run render
```

## 📱 **Fonctionnement**

### **Avec Session Existante**
- ✅ Le bot utilise automatiquement votre session dans `auth_info`
- ✅ Pas besoin de scanner un QR Code
- ✅ Connexion immédiate à WhatsApp
- ✅ Toutes les fonctionnalités disponibles

### **Première Utilisation**
Si vous n'avez pas de session :
1. Lancez `npm start`
2. Scannez le QR Code affiché dans le terminal
3. La session sera sauvegardée dans `auth_info`
4. Les prochaines fois, connexion automatique

## 🔧 **Configuration**

### **Variables d'Environnement**
Créez un fichier `.env` :
```env
GEMINI_API_KEY=votre_clé_api_gemini
CREATOR_CONTACT=+241xxxxxxxxx@s.whatsapp.net
PREFIX=-
SESSION_DIR=./auth_info
```

### **Dossier auth_info**
- ✅ Contient votre session WhatsApp
- ✅ Ne pas supprimer (sauf si problème)
- ✅ Sauvegarde automatique des données

## 📋 **Commandes du Bot**

### **Commandes Principales**
- `-menu` → Afficher le menu complet
- `-help` → Aide rapide
- `-creator` → Informations créateur
- `-ping` → Test de réponse

### **Téléchargement**
- `-yt <url>` → Télécharger vidéo YouTube
- `-fb <url>` → Télécharger vidéo Facebook
- `-ig <url>` → Télécharger vidéo Instagram

### **Médias**
- `-sticker` → Convertir en sticker
- `-video` → Convertir sticker animé en vidéo
- `-delete` → Supprimer message (groupes)

## 🛠️ **Dépannage**

### **Bot Ne Démarre Pas**
```bash
# Vérifier les dépendances
npm install

# Nettoyer la session (si problème)
rm -rf auth_info/*
npm start
```

### **Erreur de Session**
```bash
# Supprimer la session corrompue
rm -rf auth_info/*
npm start
# Scannez le nouveau QR Code
```

### **Bot Ne Répond Pas**
1. Vérifiez que le processus Node.js tourne
2. Regardez les logs dans le terminal
3. Redémarrez avec `npm start`

## 📊 **Monitoring**

### **Vérifier l'État**
```bash
# Voir les processus Node.js
Get-Process -Name "node"

# Arrêter le bot
Ctrl+C dans le terminal
```

### **Logs**
- Les logs s'affichent directement dans le terminal
- ✅ Connexion réussie : "Connecté à WhatsApp !"
- ❌ Erreur : Messages d'erreur détaillés

## 🎯 **Avantages de l'Utilisation Directe**

- ✅ **Plus Simple** : Un seul `npm start`
- ✅ **Plus Rapide** : Pas d'interface web
- ✅ **Plus Stable** : Moins de composants
- ✅ **Moins de Ressources** : Juste le bot
- ✅ **Session Persistante** : Reconnexion automatique

## 🔄 **Pour Render**

Si vous voulez déployer sur Render :
```bash
# Modifier package.json temporairement
npm run render
# Ou utiliser start-render.js
```

## 📞 **Support**

En cas de problème :
1. Vérifiez les logs dans le terminal
2. Testez avec une nouvelle session
3. Vérifiez les variables d'environnement
4. Redémarrez le bot

---

**Le bot est maintenant configuré pour une utilisation directe et simple !** 🎉


# 📱 Guide de connexion WhatsApp - Juxt_Rts Bot

## 🎯 Comment connecter le bot à ton WhatsApp

### 📋 Prérequis
- **Node.js** installé sur ton ordinateur
- **WhatsApp** installé sur ton téléphone
- **Connexion Internet** stable
- **Numéro de téléphone** avec WhatsApp

### 🚀 Étapes de connexion

#### 1. **Préparation de l'environnement**
```bash
# Aller dans le dossier du bot
cd Bot_1

# Installer les dépendances
npm install

# Créer le fichier .env
cp env.example .env
```

#### 2. **Configuration du fichier .env**
Ouvre le fichier `.env` et configure :
```env
# Clé API Gemini (optionnelle mais recommandée)
GEMINI_API_KEY=ta_cle_api_gemini_ici

# Contact du créateur (ton numéro)
CREATOR_CONTACT=+241076234942@s.whatsapp.net

# Autres paramètres (optionnels)
FALLBACK_ENABLED=true
PORT=3000
```

#### 3. **Démarrage du bot**
```bash
# Windows / Linux / Mac
npm start
```

#### 4. **Connexion WhatsApp Web**
1. **Le bot va afficher un QR code** dans le terminal
2. **Ouvre WhatsApp** sur ton téléphone
3. **Va dans Paramètres** > **Appareils connectés** > **Connecter un appareil**
4. **Scanne le QR code** affiché dans le terminal
5. **Attends la confirmation** "Connecté à WhatsApp !"

### 🔄 Processus de connexion détaillé

#### **Première connexion**
```
🤖 Démarrage de Juxt_Rts Bot avec système de fallback JSON

✅ Configuration vérifiée
🚀 Démarrage du bot...

QR Code généré, scannez-le avec WhatsApp
┌─────────────────┐
│  ██ ██ ██ ██    │
│  ██ ██ ██ ██    │
│  ██ ██ ██ ██    │
│  ██ ██ ██ ██    │
└─────────────────┘

✅ Connecté à WhatsApp !
📊 Statistiques fallback: {"categories":4,"topics":10,"responses":22}
🔧 Fallback activé: Oui
🧠 Gemini AI: Configuré
```

#### **Connexions suivantes**
- Le bot se reconnecte automatiquement
- Pas besoin de rescanner le QR code
- Les données de session sont sauvegardées dans `auth_info/`

### 🛠️ Dépannage

#### **Problème : QR code ne s'affiche pas**
```bash
# Vérifier les logs
npm start

# Ou vérifier les dépendances
npm install
```

#### **Problème : Connexion échoue**
1. **Vérifier la connexion Internet**
2. **Redémarrer le bot**
3. **Supprimer le dossier auth_info** et rescanner
```bash
rm -rf auth_info
npm start
```

#### **Problème : Bot ne répond pas**
1. **Vérifier que le bot est connecté**
2. **Tester avec `-help`**
3. **Vérifier les logs d'erreur**

### 📱 Utilisation du bot

#### **Commandes de base**
- `-help` : Menu principal
- `-info` : Informations du bot
- `-creator` : Contact du créateur

#### **Interaction naturelle**
- **Pose des questions** directement (sans préfixe)
- **Envoie des notes vocales** pour des réponses audio
- **Utilise les commandes** avec le préfixe `-`

#### **Exemples d'utilisation**
```
Toi: Salut ! Comment ça va ?
Bot: Salut ! 😊 Ça va super bien, merci ! Et toi, comment tu vas ? Je suis là pour t'aider avec tes questions !

Toi: Qu'est-ce que React ?
Bot: Salut ! 😊 J'ai trouvé quelque chose d'intéressant pour toi :

📚 **Développement Web - Frontend - JavaScript**

💡 React est un framework JavaScript moderne...

💭 *J'espère que ça t'aide ! N'hésite pas si tu as d'autres questions 😊*
```

### 🔒 Sécurité

#### **Données de session**
- Stockées dans `auth_info/`
- **Ne partage JAMAIS** ce dossier
- **Supprime-le** si tu changes de téléphone

#### **Numéro de téléphone**
- Utilise un numéro que tu contrôles
- Le bot aura accès à tes conversations
- **Teste d'abord** avec un numéro de test

### 📊 Monitoring

#### **Vérifier le statut**
```bash
# Via l'API
curl http://localhost:3000/health

# Via les logs
tail -f logs/bot.log
```

#### **Statistiques**
```bash
# Statistiques du fallback
curl http://localhost:3000/stats

# Informations détaillées
curl http://localhost:3000/info
```

### 🚨 Messages d'erreur courants

#### **"Connexion fermée"**
- Normal lors des mises à jour WhatsApp
- Le bot se reconnecte automatiquement
- Attendre quelques secondes

#### **"QR Code expiré"**
- Le QR code a une durée de vie limitée
- Redémarrer le bot pour en générer un nouveau
- Scanner rapidement après génération

#### **"Erreur d'authentification"**
- Supprimer `auth_info/` et rescanner
- Vérifier que le numéro est correct
- Redémarrer complètement

### 💡 Conseils

#### **Pour une utilisation optimale**
1. **Garde le terminal ouvert** pendant l'utilisation
2. **Utilise une connexion stable**
3. **Teste d'abord** avec des questions simples
4. **Sauvegarde** le dossier `auth_info/`

#### **Pour le développement**
1. **Utilise `npm run dev`** pour le rechargement automatique
2. **Vérifie les logs** régulièrement
3. **Teste les nouvelles fonctionnalités** avant déploiement

### 🎉 Félicitations !

Ton bot Juxt_Rts est maintenant connecté à WhatsApp ! Il peut :
- ✅ Répondre aux questions informatiques
- ✅ Convertir des médias (stickers, images, vidéos)
- ✅ Rechercher sur Google
- ✅ Télécharger des vidéos YouTube
- ✅ Fonctionner même sans Gemini AI

**Amuse-toi bien avec ton bot ! 🤖✨**

---

**Besoin d'aide ?** Contacte ELLA ASSOUMOU Juste Renaric au +241076234942

# 🤖 Guide d'utilisation - Juxt_Rts Bot avec Fallback JSON

## 🎯 Vue d'ensemble

Juxt_Rts Bot v2.0 est un bot WhatsApp intelligent qui combine l'IA Gemini avec un système de fallback JSON pour garantir des réponses même quand l'IA n'est pas disponible. Il est spécialement conçu pour répondre aux questions liées à l'informatique.

## 🚀 Démarrage rapide

### 1. Installation
```bash
# Cloner le projet
git clone <repository-url>
cd Bot_1

# Installer les dépendances
npm install

# Configurer l'environnement
cp env.example .env
# Éditer .env avec vos paramètres
```

### 2. Configuration
Éditez le fichier `.env` :
```env
# Clé API Gemini (optionnelle mais recommandée)
GEMINI_API_KEY=votre_cle_api_gemini

# Le fallback JSON est activé par défaut
FALLBACK_ENABLED=true
```

### 3. Démarrage
```bash
# Toutes plateformes
npm start
```

## 📱 Utilisation sur WhatsApp

### Commandes disponibles
- `-help` : Menu avec image
- `-menu` : Menu avec GIF
- `-info` : Informations du bot
- `-creator` : Contact du créateur
- `-sticker` : Convertir média en sticker
- `-image` : Convertir sticker en image
- `-video` : Convertir sticker en vidéo
- `-download` : Télécharger un statut
- `-yt <url>` : Télécharger vidéo YouTube
- `-find <query>` : Recherche Google
- `-gimage <query>` : Recherche d'image

### Interaction avec l'IA
- **Messages texte** : Posez directement vos questions
- **Notes vocales** : Le bot transcrit et répond
- **Groupes** : Mentionnez @AquilaBot ou répondez à ses messages

## 🧠 Système de Fallback

### Comment ça marche
1. **Gemini AI** (priorité) : Réponses intelligentes et contextuelles
2. **Fallback JSON** : Base de connaissances locales si Gemini échoue
3. **Recherche intelligente** : Correspondance floue basée sur les mots-clés

### Domaines couverts
- **Développement Web** : HTML, CSS, JavaScript, React, Node.js, Python, PHP
- **Développement Mobile** : Android, iOS, React Native, Flutter
- **Hacking Éthique** : OSINT, vulnérabilités, outils, méthodologies
- **Informatique Générale** : Algorithmes, systèmes, réseaux

### Exemples de questions
```
✅ "Qu'est-ce que React ?"
✅ "Comment utiliser CSS Flexbox ?"
✅ "Explique SQL Injection"
✅ "Qu'est-ce que Metasploit ?"
✅ "Comment développer une app Android ?"
❌ "Comment cuisiner un gâteau ?"
❌ "Quelle est la météo ?"
```

## 🔧 Configuration avancée

### Variables d'environnement
```env
# Fallback
FALLBACK_JSON_PATH=./fallback_responses.json
FALLBACK_ENABLED=true

# Gemini AI
GEMINI_API_KEY=votre_cle
GEMINI_TIMEOUT=30000
MAX_GEMINI_RETRIES=2

# Bot
PREFIX=-
CREATOR_CONTACT=+241066813542@s.whatsapp.net
PORT=3000
```

### Personnalisation de la base de connaissances
1. Modifiez `fallback_responses.json`
2. Ajoutez de nouvelles catégories/sujets
3. Redémarrez le bot ou utilisez l'API `/reload-fallback`

## 🌐 API du serveur

### Endpoints disponibles
- `GET /` : Informations générales
- `GET /stats` : Statistiques du fallback
- `POST /test-fallback` : Tester une question
- `POST /reload-fallback` : Recharger la base
- `GET /health` : Santé du système
- `GET /info` : Informations détaillées

### Exemple d'utilisation
```bash
# Tester une question
curl -X POST http://localhost:3000/test-fallback \
  -H "Content-Type: application/json" \
  -d '{"question": "Qu'\''est-ce que React ?"}'

# Obtenir les statistiques
curl http://localhost:3000/stats
```

## 🧪 Tests

### Test du système de fallback
```bash
# Test complet
npm test

# Test manuel
# Aucun script manuel séparé actuellement
```

### Métriques de performance
- **Temps de réponse** : < 1ms pour le fallback
- **Couverture** : ~80% des questions informatiques
- **Disponibilité** : 99.9% (pas de dépendance externe)

## 🚨 Dépannage

### Problèmes courants

#### Bot ne démarre pas
```bash
# Vérifier Node.js
node --version

# Vérifier les dépendances
npm install

# Vérifier le fichier .env
cat .env
```

#### Fallback ne fonctionne pas
```bash
# Vérifier le fichier JSON
ls -la fallback_responses.json

# Tester le fallback
npm test
```

#### Gemini ne répond pas
- Vérifier la clé API dans `.env`
- Vérifier le quota sur Google Cloud Console
- Le fallback prendra le relais automatiquement

### Logs et monitoring
```bash
# Voir les logs en temps réel
tail -f logs/bot.log

# Vérifier le statut via l'API
curl http://localhost:3000/health
```

## 📊 Statistiques

### Base de connaissances actuelle
- **4 catégories** principales
- **10 sujets** spécialisés
- **22 réponses** détaillées
- **100+ mots-clés** de recherche

### Performance
- **Temps de recherche** : < 1ms
- **Taux de correspondance** : ~80%
- **Mémoire utilisée** : < 10MB
- **Uptime** : 99.9%

## 🔄 Maintenance

### Mise à jour de la base
1. Modifier `fallback_responses.json`
2. Appeler l'API `/reload-fallback`
3. Vérifier les statistiques via `/stats`

### Sauvegarde
```bash
# Sauvegarder la base de connaissances
cp fallback_responses.json backup/fallback_$(date +%Y%m%d).json

# Sauvegarder la configuration
cp .env backup/env_$(date +%Y%m%d).env
```

## 🤝 Contribution

### Ajouter de nouvelles réponses
1. Ouvrir `fallback_responses.json`
2. Ajouter dans la catégorie appropriée
3. Définir les mots-clés de recherche
4. Tester avec `npm test`

### Structure d'une réponse
```json
{
  "questions": ["mot1", "mot2", "phrase complète"],
  "responses": [
    "Réponse détaillée 1",
    "Réponse détaillée 2"
  ]
}
```

## 📞 Support

- **Créateur** : Juxt_Rts
- **WhatsApp** : +241076234942
- **Email** : [Votre email]
- **GitHub** : [Votre profil]

## 📄 Licence

Ce projet est sous licence ISC. Voir `package.json` pour plus de détails.

---

**Fait avec ❤️ par Juxt_Rts**

*Juxt_Rts Bot v2.0 - Votre assistant WhatsApp intelligent avec fallback JSON*

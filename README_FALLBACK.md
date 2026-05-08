# 🤖 Juxt_Rts Bot - Système de Fallback JSON

## Vue d'ensemble

Juxt_Rts Bot v2.0 intègre un système de fallback intelligent basé sur une base de connaissances JSON. Quand Gemini AI n'est pas disponible ou échoue, le bot utilise automatiquement ses connaissances locales pour répondre aux questions liées à l'informatique.

## 🎯 Fonctionnalités du Fallback

### 📚 Base de connaissances complète
- **Développement Web** : HTML, CSS, JavaScript, React, Node.js, Python, PHP, bases de données
- **Développement Mobile** : Android, iOS, React Native, Flutter, Xamarin
- **Hacking Éthique** : OSINT, vulnérabilités, outils, méthodologies de pentest
- **Informatique Générale** : Algorithmes, systèmes d'exploitation, réseaux

### 🔍 Recherche intelligente
- Correspondance floue basée sur les mots-clés
- Score de pertinence configurable
- Recherche multi-niveaux (catégorie → sous-catégorie → sujet)
- Limitation du nombre de réponses pour éviter le spam

### ⚡ Performance optimisée
- Chargement en mémoire pour des réponses rapides
- Cache intelligent des correspondances
- Rechargement à chaud sans redémarrage

## 🏗️ Architecture

```
Bot WhatsApp
├── Gemini AI (Primaire)
│   ├── Réponses intelligentes
│   ├── Support multilingue
│   └── Compréhension contextuelle
└── Fallback JSON (Secondaire)
    ├── Base de connaissances
    ├── Recherche floue
    └── Réponses structurées
```

## 📁 Structure des fichiers

```
Bot_1/
├── fallback_responses.json      # Base de connaissances JSON
├── fallbackHandler.js           # Gestionnaire de fallback
├── bot_with_fallback.js         # Bot principal avec fallback
├── server_with_fallback.js      # Serveur Express avec API
├── package.json                 # Scripts npm (dont test)
├── env.example                  # Variables d'environnement
└── README_FALLBACK.md           # Cette documentation
```

## 🚀 Installation et configuration

### 1. Prérequis
- Node.js 18+
- FFmpeg installé
- Clé API Gemini (optionnelle)

### 2. Installation
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

### 3. Configuration du .env
```env
# Clé API Gemini (optionnelle)
GEMINI_API_KEY=votre_cle_api_gemini

# Configuration du fallback
FALLBACK_JSON_PATH=./fallback_responses.json
FALLBACK_ENABLED=true

# Autres paramètres...
```

## 💻 Utilisation

### Démarrer le bot
```bash
# Mode complet (bot + serveur)
npm start

# Bot seul
npm run bot

# Mode développement
npm run dev
```

### Tester le fallback
```bash
# Test complet du système
npm test

# Test manuel
# Aucun script manuel séparé actuellement
```

## 🔧 API du serveur

### Endpoints disponibles

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/` | GET | Informations générales |
| `/stats` | GET | Statistiques du fallback |
| `/test-fallback` | POST | Tester une question |
| `/reload-fallback` | POST | Recharger la base |
| `/health` | GET | Santé du système |
| `/info` | GET | Informations détaillées |

### Exemple d'utilisation API

```bash
# Tester une question
curl -X POST http://localhost:3000/test-fallback \
  -H "Content-Type: application/json" \
  -d '{"question": "Qu\'est-ce que React ?"}'

# Obtenir les statistiques
curl http://localhost:3000/stats

# Recharger la base de connaissances
curl -X POST http://localhost:3000/reload-fallback
```

## 📊 Base de connaissances

### Structure JSON
```json
{
  "categories": {
    "developpement_web": {
      "frontend": {
        "html": {
          "questions": ["html", "balise", "structure"],
          "responses": ["Réponse 1", "Réponse 2"]
        }
      }
    }
  }
}
```

### Catégories disponibles

#### 🌐 Développement Web
- **Frontend** : HTML, CSS, JavaScript, Frameworks
- **Backend** : Node.js, Python, PHP, Bases de données
- **DevOps** : Déploiement, Contrôle de version

#### 📱 Développement Mobile
- **Native** : Android (Java/Kotlin), iOS (Swift)
- **Cross-platform** : React Native, Flutter, Xamarin

#### 🔒 Hacking Éthique
- **Reconnaissance** : OSINT, Footprinting, Scanning
- **Vulnérabilités** : CVE, Exploits, Payloads
- **Sécurité Web** : OWASP, Authentification, HTTPS
- **Sécurité Réseau** : Firewall, IDS/IPS, Analyse trafic
- **Outils** : Metasploit, Burp Suite, Nmap, Wireshark
- **Méthodologie** : Pentest, Reporting, Remédiation

#### 💻 Informatique Générale
- **Programmation** : Algorithmes, Structures de données, OOP
- **Systèmes** : Linux, Windows, macOS
- **Réseaux** : TCP/IP, HTTP/HTTPS, Protocoles

## 🔍 Algorithme de recherche

### Correspondance floue
1. **Normalisation** : Conversion en minuscules et suppression des espaces
2. **Tokenisation** : Division en mots individuels
3. **Correspondance** : Comparaison avec les mots-clés de chaque sujet
4. **Scoring** : Calcul du score de pertinence (0-1)
5. **Seuil** : Filtrage par seuil minimum (défaut: 0.3)

### Exemple de calcul
```
Question: "Comment utiliser CSS Flexbox ?"
Mots-clés: ["css", "flexbox", "layout"]
Score: 2/3 = 0.67 (au-dessus du seuil)
```

## ⚙️ Configuration avancée

### Variables d'environnement
```env
# Fallback
FALLBACK_JSON_PATH=./fallback_responses.json
FALLBACK_ENABLED=true

# Gemini
GEMINI_API_KEY=votre_cle
GEMINI_TIMEOUT=30000
MAX_GEMINI_RETRIES=2

# Bot
PREFIX=-
CREATOR_CONTACT=+241066813542@s.whatsapp.net
```

### Personnalisation de la base
1. **Modifier** `fallback_responses.json`
2. **Ajouter** de nouvelles catégories/sujets
3. **Recharger** via l'API ou redémarrer le bot

## 🧪 Tests et validation

### Tests automatiques
```bash
# Test complet
npm test

# Test de performance
node -e "
const FallbackHandler = require('./fallbackHandler');
const handler = new FallbackHandler();
console.time('100 recherches');
for(let i=0; i<100; i++) {
  handler.searchResponse('JavaScript');
}
console.timeEnd('100 recherches');
"
```

### Métriques de qualité
- **Couverture** : Pourcentage de questions avec réponse
- **Pertinence** : Score moyen des correspondances
- **Performance** : Temps de réponse moyen
- **Disponibilité** : Uptime du système

## 🔧 Maintenance

### Mise à jour de la base
1. Modifier `fallback_responses.json`
2. Appeler `/reload-fallback` ou redémarrer
3. Vérifier les statistiques via `/stats`

### Monitoring
- Logs détaillés des recherches
- Métriques de performance
- Alertes en cas d'erreur
- Dashboard de santé

## 🚨 Dépannage

### Problèmes courants

#### Fallback non disponible
```bash
# Vérifier le fichier JSON
ls -la fallback_responses.json

# Vérifier les logs
tail -f logs/bot.log
```

#### Réponses non trouvées
- Vérifier les mots-clés dans la question
- Ajuster le seuil de correspondance
- Ajouter de nouveaux sujets

#### Performance lente
- Vérifier la taille de la base JSON
- Optimiser les mots-clés
- Augmenter les ressources serveur

## 📈 Évolutions futures

### Fonctionnalités prévues
- [ ] Apprentissage automatique des correspondances
- [ ] Interface web d'administration
- [ ] Synchronisation avec base externe
- [ ] Support multilingue avancé
- [ ] Analytics et reporting

### Améliorations techniques
- [ ] Cache Redis pour la performance
- [ ] Indexation full-text
- [ ] API GraphQL
- [ ] Tests automatisés complets

## 🤝 Contribution

### Comment contribuer
1. Fork le projet
2. Créer une branche feature
3. Ajouter/modifier la base de connaissances
4. Tester les modifications
5. Créer une Pull Request

### Standards
- Format JSON valide
- Mots-clés en minuscules
- Réponses en français
- Documentation des ajouts

## 📄 Licence

Ce projet est sous licence ISC. Voir le fichier `package.json` pour plus de détails.

---

**Créé avec ❤️ par Juxt_Rts**

*Juxt_Rts Bot v2.0 - Votre assistant WhatsApp intelligent avec fallback JSON*

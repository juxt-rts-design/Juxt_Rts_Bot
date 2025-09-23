# 🚀 Interface Web pour Bot WhatsApp

Interface web générique pour n'importe quel bot WhatsApp. Modifiez simplement `bot-config.json` pour adapter à votre bot.

## ⚡ **Démarrage Rapide**

### **1. Installation**
```bash
cd web-interface
npm install
```

### **2. Configuration**
Modifiez `bot-config.json` :
```json
{
  "botFile": "../mon_bot.js",
  "botName": "Mon Bot",
  "authDir": "../auth_info"
}
```

### **3. Lancement**
```bash
npm run web
```

### **4. Accès**
Ouvrez : `http://localhost:3000`

## 🔧 **Adaptation pour Autre Bot**

### **Étape 1 : Copier**
```bash
cp -r web-interface/ mon_projet/
cd mon_projet/web-interface
```

### **Étape 2 : Configurer**
```json
{
  "botFile": "../mon_bot.js",
  "botName": "Mon Bot",
  "authDir": "../sessions"
}
```

### **Étape 3 : Lancer**
```bash
npm run web
```

## ⚙️ **Configuration**

| Paramètre | Description | Exemple |
|-----------|-------------|---------|
| `botFile` | Chemin vers votre bot | `"../mon_bot.js"` |
| `botName` | Nom de votre bot | `"Mon Bot"` |
| `authDir` | Dossier des sessions | `"../auth_info"` |

## 📝 **Votre Bot Doit**

Accepter ces variables d'environnement :
```javascript
const SESSION_ID = process.env.SESSION_ID;
const SESSION_DIR = process.env.SESSION_DIR;
```

## ⚠️ **Problèmes Courants**

**Port occupé :**
```bash
taskkill /f /im node.exe
npm run web
```

**Bot non trouvé :**
- Vérifiez le chemin dans `bot-config.json`
- Utilisez des chemins relatifs : `../mon_bot.js`

---

**C'est tout ! Votre interface web est prête ! 🎉**
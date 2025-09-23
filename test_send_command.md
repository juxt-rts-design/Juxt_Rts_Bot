# 🧪 **Test de la Commande -send pour Vues Uniques** 🚀

## ✅ **Améliorations apportées :**

### 1. **Logs de debug détaillés** 🔧
- **Commande détectée** : Affiche si la commande est reconnue
- **Message cité** : Vérifie s'il y a un message cité
- **Type de média** : Détecte image/vidéo/vue unique
- **Étapes** : Suit chaque étape du processus

### 2. **Double gestion des commandes** 📱
- **Avec préfixe** : `-send` fonctionne
- **Sans préfixe** : `send` fonctionne aussi
- **Vérification** : Contrôle si c'est une réponse à un média

## 🎯 **Comment tester :**

### **1. Redémarre le bot :**
```bash
npm start
```

### **2. Teste avec une vue unique :**
```
1. Envoie-toi une image/vidéo en mode "vue unique" (icône "1")
2. Réponds à cette vue unique avec : -send
3. Regarde les logs dans le terminal
```

### **3. Teste avec une image normale :**
```
1. Envoie-toi une image normale
2. Réponds à cette image avec : -send
3. Vérifie que ça fonctionne
```

## 🔍 **Logs à surveiller :**

### **Logs attendus pour vue unique :**
```
🔍 Vérification commande directe: -send
✅ Commande send détectée !
🔍 Message cité trouvé: {
  hasImageMessage: false,
  hasVideoMessage: false,
  hasViewOnceMessage: true,  ← Ici ça devrait être true !
  viewOnceImage: true,       ← Et ici aussi !
  viewOnceVideo: false
}
👁️ Commande send sur vue unique
✅ Média trouvé dans vue unique, traitement...
📸 Traitement vue unique...
```

### **Si ça ne marche pas :**
```
❌ Aucun message cité trouvé
❌ Aucun média détecté dans le message cité
❌ Aucun média trouvé dans vue unique
```

## 🎉 **Résultats attendus :**
- ✅ **Commande -send détectée** sur vues uniques
- ✅ **Média extrait** de la vue unique
- ✅ **Image/vidéo envoyée** en tant que média normal
- ✅ **Logs détaillés** pour diagnostiquer

**Lance le test et regarde les logs pour voir ce qui se passe !** 🔍✨

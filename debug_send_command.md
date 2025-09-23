# 🔍 **Debug de la Commande -send** 🚀

## ✅ **Améliorations apportées :**

### 1. **Logs de debug détaillés** 🔧
- **Commande détectée** : Affiche la commande reçue
- **Type de média** : Vérifie image/vidéo/vue unique
- **Étapes** : Suit chaque étape du processus

### 2. **Gestion des commandes directes** 📱
- **Sans préfixe** : `send` fonctionne aussi
- **Avec préfixe** : `-send` fonctionne aussi
- **Vérification** : Contrôle si c'est une réponse à un média

### 3. **Support complet des vues uniques** 👁️
- **Détection** : `viewOnceMessage`
- **Extraction** : Média de la vue unique
- **Traitement** : Même logique que les médias normaux

## 🎯 **Comment tester :**

### **1. Redémarre le bot :**
```bash
npm start
```

### **2. Teste avec logs :**
```
1. Envoie une vue unique
2. Réponds avec : -send
3. Regarde les logs dans le terminal
4. Vérifie les messages de debug
```

### **3. Teste les variantes :**
```
1. Envoie une vue unique
2. Réponds avec : send (sans tiret)
3. Vérifie que ça fonctionne
```

## 🔍 **Logs à surveiller :**

### **Logs attendus :**
```
🔍 Debug commande: {
  command: '-send',
  hasImageMessage: false,
  hasVideoMessage: false,
  hasViewOnceMessage: true,
  viewOnceImage: true,
  viewOnceVideo: false
}
👁️ Vue unique détectée
📸 Commande send détectée sur vue unique
✅ Média trouvé dans vue unique
📸 Traitement vue unique...
```

### **Si ça ne marche pas :**
```
❌ Aucun média trouvé dans vue unique
```

## 🎉 **Résultats attendus :**
- ✅ **Logs détaillés** pour diagnostiquer
- ✅ **Commande -send fonctionne** sur vues uniques
- ✅ **Commande send fonctionne** aussi
- ✅ **Messages d'erreur clairs** si problème

**Lance le test et regarde les logs pour voir ce qui se passe !** 🔍✨

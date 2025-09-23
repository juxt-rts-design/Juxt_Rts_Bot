# 🔍 **Debug de la Commande -send avec Message Cité** 🚀

## ✅ **Logs de debug ajoutés :**

### 1. **Message complet** 🔧
- **Structure** : Affiche la structure complète du message
- **Détection** : Vérifie si le message cité est détecté
- **Contenu** : Analyse le contenu du message cité

### 2. **Diagnostic détaillé** 📱
- **Message cité** : Vérifie la présence d'un message cité
- **Type de média** : Détecte image/vidéo/vue unique
- **Étapes** : Suit chaque étape du processus

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

### **Logs attendus :**
```
✅ Commande -send détectée dans switch !
🔍 Message complet: { ... }
🔍 Message cité détecté: true
🔍 Contenu du message cité: {
  hasImageMessage: false,
  hasVideoMessage: false,
  hasViewOnceMessage: true,  ← Ici ça devrait être true !
  viewOnceImage: true,       ← Et ici aussi !
  viewOnceVideo: false
}
👁️ Commande -send sur vue unique
✅ Média trouvé dans vue unique, traitement...
```

### **Si ça ne marche pas :**
```
❌ Aucun message cité trouvé
❌ Aucun média détecté dans le message cité
```

## 🎉 **Résultats attendus :**
- ✅ **Commande -send détectée** dans le switch
- ✅ **Message cité détecté** correctement
- ✅ **Média extrait** de la vue unique
- ✅ **Image/vidéo envoyée** en tant que média normal

**Lance le test et copie-moi les logs pour voir ce qui se passe !** 🔍✨

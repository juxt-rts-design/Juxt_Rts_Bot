#!/usr/bin/env node

/**
 * Fichier de démarrage pour Render.com
 * Gère l'interface web et le bot WhatsApp
 */

const WebInterfaceServer = require('./web-interface/server.js');

console.log('🚀 Démarrage du bot sur Render...');

// Créer le serveur web (il démarre automatiquement dans le constructeur)
const server = new WebInterfaceServer();

// Le serveur démarre automatiquement dans le constructeur
// Pas besoin de redémarrer ici

console.log('✅ Bot démarré sur Render !');
console.log(`🌐 Interface web disponible sur le port ${process.env.PORT || 3000}`);
console.log(`📱 Accédez à: https://juxt-rts-bot.onrender.com`);

// Gérer l'arrêt propre
process.on('SIGINT', () => {
  console.log('🛑 Arrêt du bot...');
  server.stopBot();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🛑 Arrêt du bot...');
  server.stopBot();
  process.exit(0);
});

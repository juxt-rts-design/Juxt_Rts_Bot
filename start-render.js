#!/usr/bin/env node

/**
 * Fichier de démarrage pour Render.com
 * Gère l'interface web et le bot WhatsApp
 */

const WebInterfaceServer = require('./web-interface/server.js');

console.log('🚀 Démarrage du bot sur Render...');

// Créer et démarrer le serveur web
const server = new WebInterfaceServer();

// Démarrer le serveur sur le port Render
const PORT = process.env.PORT || 3000;
server.server.listen(PORT, () => {
  console.log('✅ Bot démarré sur Render !');
  console.log(`🌐 Interface web disponible sur le port ${PORT}`);
  console.log(`📱 Accédez à: https://juxt-rts-bot.onrender.com`);
});

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

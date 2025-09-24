#!/usr/bin/env node

/**
 * Fichier de démarrage pour Render.com
 * Gère l'interface web et le bot WhatsApp
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Démarrage du bot sur Render...');

// Démarrer l'interface web
console.log('🌐 Démarrage de l\'interface web...');
const webProcess = spawn('node', ['web-interface/server.js'], {
  cwd: __dirname,
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: process.env.PORT || 3000
  }
});

webProcess.on('error', (err) => {
  console.error('❌ Erreur interface web:', err);
});

webProcess.on('exit', (code) => {
  console.log(`🌐 Interface web arrêtée avec le code: ${code}`);
});

// Gérer l'arrêt propre
process.on('SIGINT', () => {
  console.log('🛑 Arrêt du bot...');
  webProcess.kill('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🛑 Arrêt du bot...');
  webProcess.kill('SIGTERM');
  process.exit(0);
});

console.log('✅ Bot démarré sur Render !');
console.log(`🌐 Interface web disponible sur le port ${process.env.PORT || 3000}`);

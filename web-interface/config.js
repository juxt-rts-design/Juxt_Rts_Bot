const path = require('path');

const config = {
    // Configuration du serveur
    port: process.env.PORT || 3000,
    
    // Dossiers
    authDir: path.join(__dirname, '..', 'auth_info'),
    botPath: path.join(__dirname, '..', 'bot_with_fallback.js'),
    
    // Configuration des sessions
    sessionTimeout: 300000, // 5 minutes
    maxSessions: 10,
    
    // Configuration QR Code
    qrSize: 300,
    qrMargin: 2,
    
    // Configuration des codes de liaison
    pairingCodeLength: 6,
    pairingCodeTimeout: 60000, // 1 minute
    
    // Configuration de sécurité
    allowedOrigins: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000'],
    
    // Configuration du bot
    botName: 'JUXT_RTS Bot',
    botVersion: '1.0.0',
    
    // Logs
    logLevel: process.env.LOG_LEVEL || 'info',
    logFile: path.join(__dirname, 'logs', 'web-interface.log')
};

module.exports = config;

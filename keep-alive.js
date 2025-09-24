#!/usr/bin/env node

/**
 * Script de monitoring pour maintenir le bot actif sur Render
 * Évite que le bot s'endorme en faisant des requêtes périodiques
 */

const axios = require('axios');

const BOT_URL = process.env.BOT_URL || 'https://juxt-rts-bot.onrender.com';
const INTERVAL = 10 * 60 * 1000; // 10 minutes

console.log('🔄 Script de monitoring démarré');
console.log(`📡 URL du bot: ${BOT_URL}`);
console.log(`⏰ Intervalle: ${INTERVAL / 1000 / 60} minutes`);

async function pingBot() {
    try {
        console.log(`🏓 Ping du bot à ${new Date().toLocaleTimeString()}`);
        
        const response = await axios.get(`${BOT_URL}/health`, {
            timeout: 10000
        });
        
        console.log('✅ Bot actif:', {
            status: response.data.status,
            activeSessions: response.data.activeSessions,
            botRunning: response.data.botRunning,
            uptime: Math.round(response.data.uptime / 60) + ' minutes'
        });
        
    } catch (error) {
        console.error('❌ Erreur ping bot:', error.message);
        
        // Essayer de réveiller le bot
        try {
            console.log('🔄 Tentative de réveil du bot...');
            await axios.get(BOT_URL, { timeout: 15000 });
            console.log('✅ Bot réveillé');
        } catch (wakeError) {
            console.error('❌ Impossible de réveiller le bot:', wakeError.message);
        }
    }
}

// Ping initial
pingBot();

// Ping périodique
setInterval(pingBot, INTERVAL);

console.log('🚀 Monitoring en cours...');

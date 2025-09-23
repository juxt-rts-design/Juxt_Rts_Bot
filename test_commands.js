const FallbackHandler = require('./fallbackHandler');

/**
 * Test rapide des commandes du bot
 */
async function testCommands() {
    console.log('🧪 Test des commandes Juxt_Rts Bot\n');
    
    const fallbackHandler = new FallbackHandler();
    
    if (!fallbackHandler.isAvailable()) {
        console.error('❌ Fallback non disponible');
        return;
    }
    
    console.log('✅ Fallback chargé\n');
    
    // Test des questions rapides
    const quickTests = [
        'Qu\'est-ce que React ?',
        'Comment utiliser CSS ?',
        'Explique JavaScript',
        'Qu\'est-ce que Python ?'
    ];
    
    console.log('🔍 Test des réponses rapides:\n');
    
    for (const question of quickTests) {
        console.log(`Question: "${question}"`);
        const start = Date.now();
        const response = fallbackHandler.searchResponse(question);
        const duration = Date.now() - start;
        
        if (response) {
            console.log(`✅ Réponse trouvée en ${duration}ms`);
            console.log(`📝 Aperçu: ${response.substring(0, 100)}...\n`);
        } else {
            console.log(`❌ Aucune réponse trouvée en ${duration}ms\n`);
        }
    }
    
    console.log('🎉 Tests terminés !');
    console.log('\n📋 Instructions pour tester le bot:');
    console.log('1. Lance: npm start');
    console.log('2. Scanne le QR code avec WhatsApp');
    console.log('3. Teste ces commandes:');
    console.log('   • Envoie une image + réponds "-sticker"');
    console.log('   • Pose une question technique');
    console.log('   • Utilise "-help" pour le menu');
    console.log('\n🚀 Le bot devrait répondre instantanément !');
}

testCommands().catch(console.error);

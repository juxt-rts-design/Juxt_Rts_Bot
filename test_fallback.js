const FallbackHandler = require('./fallbackHandler');

/**
 * Script de test pour le système de fallback JSON
 */
async function testFallbackSystem() {
    console.log('🧪 Test du système de fallback Juxt_Rts Bot\n');
    
    const fallbackHandler = new FallbackHandler();
    
    // Vérifier si le fallback est disponible
    if (!fallbackHandler.isAvailable()) {
        console.error('❌ Le système de fallback n\'est pas disponible');
        return;
    }
    
    console.log('✅ Système de fallback chargé avec succès\n');
    
    // Afficher les statistiques
    const stats = fallbackHandler.getStats();
    console.log('📊 Statistiques de la base de connaissances:');
    console.log(`   • Catégories: ${stats.categories}`);
    console.log(`   • Sujets: ${stats.topics}`);
    console.log(`   • Réponses: ${stats.responses}\n`);
    
    // Questions de test
    const testQuestions = [
        // Développement Web
        'Qu\'est-ce que HTML ?',
        'Comment utiliser CSS Flexbox ?',
        'Explique-moi JavaScript ES6',
        'Qu\'est-ce que React ?',
        'Comment créer une API REST avec Node.js ?',
        'Qu\'est-ce que MongoDB ?',
        'Comment déployer avec Docker ?',
        'Explique Git et GitHub',
        
        // Développement Mobile
        'Comment développer une app Android ?',
        'Qu\'est-ce que React Native ?',
        'Explique Flutter et Dart',
        'Comment créer une app iOS ?',
        
        // Hacking Éthique
        'Qu\'est-ce que l\'OSINT ?',
        'Comment utiliser Nmap ?',
        'Explique les vulnérabilités OWASP',
        'Qu\'est-ce que Metasploit ?',
        'Comment faire un pentest ?',
        'Explique SQL Injection',
        'Qu\'est-ce que XSS ?',
        'Comment analyser le trafic réseau ?',
        
        // Informatique Générale
        'Qu\'est-ce qu\'un algorithme ?',
        'Explique les structures de données',
        'Comment fonctionne TCP/IP ?',
        'Qu\'est-ce que Linux ?',
        
        // Questions sans réponse
        'Comment cuisiner un gâteau ?',
        'Quelle est la météo aujourd\'hui ?'
    ];
    
    console.log('🔍 Test des questions de la base de connaissances:\n');
    
    for (let i = 0; i < testQuestions.length; i++) {
        const question = testQuestions[i];
        console.log(`${i + 1}. Question: "${question}"`);
        
        const response = fallbackHandler.searchResponse(question);
        
        if (response) {
            console.log('   ✅ Réponse trouvée');
            // Afficher un extrait de la réponse
            const preview = response.substring(0, 100) + '...';
            console.log(`   📝 Aperçu: ${preview}\n`);
        } else {
            console.log('   ❌ Aucune réponse trouvée\n');
        }
    }
    
    // Test de performance
    console.log('⚡ Test de performance:\n');
    
    const startTime = Date.now();
    const iterations = 100;
    
    for (let i = 0; i < iterations; i++) {
        fallbackHandler.searchResponse('Qu\'est-ce que JavaScript ?');
    }
    
    const endTime = Date.now();
    const avgTime = (endTime - startTime) / iterations;
    
    console.log(`   • ${iterations} recherches effectuées`);
    console.log(`   • Temps total: ${endTime - startTime}ms`);
    console.log(`   • Temps moyen par recherche: ${avgTime.toFixed(2)}ms`);
    
    // Test de rechargement
    console.log('\n🔄 Test de rechargement:\n');
    
    try {
        fallbackHandler.reload();
        console.log('✅ Rechargement réussi');
    } catch (error) {
        console.error('❌ Erreur lors du rechargement:', error.message);
    }
    
    console.log('\n🎉 Tests terminés !');
}

// Exécuter les tests
testFallbackSystem().catch(console.error);

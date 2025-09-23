const express = require('express');
const path = require('path');
const FallbackHandler = require('./fallbackHandler');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialiser le gestionnaire de fallback
const fallbackHandler = new FallbackHandler();

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Route principale
app.get('/', (req, res) => {
    const stats = fallbackHandler.getStats();
    res.json({
        message: '🤖 Juxt_Rts Bot avec système de fallback JSON',
        status: 'En ligne',
        fallback: {
            enabled: fallbackHandler.isAvailable(),
            stats: stats
        },
        creator: 'ELLA ASSOUMOU Juste Renaric',
        contact: '+241076234942'
    });
});

// Route pour les statistiques du fallback
app.get('/stats', (req, res) => {
    const stats = fallbackHandler.getStats();
    res.json({
        fallback: {
            enabled: fallbackHandler.isAvailable(),
            stats: stats,
            categories: {
                'Développement Web': {
                    'Frontend': ['HTML', 'CSS', 'JavaScript', 'Frameworks'],
                    'Backend': ['Node.js', 'Python', 'PHP', 'Bases de données'],
                    'DevOps': ['Déploiement', 'Contrôle de version']
                },
                'Développement Mobile': {
                    'Native': ['Android', 'iOS'],
                    'Cross-platform': ['React Native', 'Flutter', 'Xamarin']
                },
                'Hacking Éthique': {
                    'Reconnaissance': ['OSINT', 'Footprinting', 'Scanning'],
                    'Vulnérabilités': ['CVE', 'Exploits', 'Payloads'],
                    'Sécurité Web': ['OWASP', 'Authentification', 'HTTPS'],
                    'Sécurité Réseau': ['Firewall', 'IDS/IPS', 'Analyse trafic'],
                    'Outils': ['Metasploit', 'Burp Suite', 'Nmap', 'Wireshark'],
                    'Méthodologie': ['Pentest', 'Reporting', 'Remédiation']
                },
                'Informatique Générale': {
                    'Programmation': ['Algorithmes', 'Structures de données', 'OOP'],
                    'Systèmes': ['Linux', 'Windows', 'macOS'],
                    'Réseaux': ['TCP/IP', 'HTTP/HTTPS', 'Protocoles']
                }
            }
        }
    });
});

// Route pour tester le fallback
app.post('/test-fallback', (req, res) => {
    const { question } = req.body;
    
    if (!question) {
        return res.status(400).json({ error: 'Question requise' });
    }
    
    const response = fallbackHandler.searchResponse(question);
    
    res.json({
        question: question,
        response: response || 'Aucune réponse trouvée dans la base de connaissances',
        fallback_available: fallbackHandler.isAvailable()
    });
});

// Route pour recharger le fallback
app.post('/reload-fallback', (req, res) => {
    try {
        fallbackHandler.reload();
        res.json({ 
            message: 'Fallback rechargé avec succès',
            stats: fallbackHandler.getStats()
        });
    } catch (error) {
        res.status(500).json({ 
            error: 'Erreur lors du rechargement',
            message: error.message
        });
    }
});

// Route pour la santé du bot
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        fallback: {
            enabled: fallbackHandler.isAvailable(),
            stats: fallbackHandler.getStats()
        }
    });
});

// Route pour les informations détaillées
app.get('/info', (req, res) => {
    const stats = fallbackHandler.getStats();
    res.json({
        bot: {
            name: 'Juxt_Rts Bot',
            version: '2.0',
            creator: 'Juxt_Rts',
            contact: '+241076234942',
            features: [
                'Intelligence Artificielle (Gemini AI)',
                'Système de fallback JSON',
                'Support audio (transcription + synthèse)',
                'Conversion multimédia (stickers, images, vidéos)',
                'Recherche web (Google + Images)',
                'Téléchargement YouTube',
                'Support groupes WhatsApp'
            ]
        },
        fallback: {
            enabled: fallbackHandler.isAvailable(),
            stats: stats,
            description: 'Système de fallback intelligent basé sur une base de connaissances JSON couvrant le développement web, mobile et le hacking éthique'
        },
        gemini: {
            configured: !!process.env.GEMINI_API_KEY,
            timeout: process.env.GEMINI_TIMEOUT || 30000,
            max_retries: process.env.MAX_GEMINI_RETRIES || 2
        }
    });
});

// Gestion des erreurs 404
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Route non trouvée',
        available_routes: [
            'GET /',
            'GET /stats',
            'POST /test-fallback',
            'POST /reload-fallback',
            'GET /health',
            'GET /info'
        ]
    });
});

// Gestion des erreurs globales
app.use((error, req, res, next) => {
    console.error('Erreur serveur:', error);
    res.status(500).json({
        error: 'Erreur interne du serveur',
        message: error.message
    });
});

// Démarrer le serveur
app.listen(PORT, () => {
    console.log(`🚀 Serveur Juxt_Rts Bot démarré sur le port ${PORT}`);
    console.log(`📊 Fallback JSON: ${fallbackHandler.isAvailable() ? '✅ Actif' : '❌ Inactif'}`);
    console.log(`🧠 Gemini AI: ${process.env.GEMINI_API_KEY ? '✅ Configuré' : '❌ Non configuré'}`);
    console.log(`📚 Base de connaissances: ${JSON.stringify(fallbackHandler.getStats())}`);
    console.log(`🌐 API disponible sur: http://localhost:${PORT}`);
});

module.exports = app;

const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const qrcode = require('qrcode');
const pino = require('pino');
const { makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');

class WebInterfaceServer {
    constructor() {
        // Charger la configuration du bot
        let botConfig = {};
        try {
            botConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'bot-config.json'), 'utf8'));
        } catch (error) {
            console.log('⚠️ Configuration bot non trouvée, utilisation des valeurs par défaut');
            botConfig = {
                botFile: '../bot_with_fallback.js',
                botName: 'JUXT_RTS Bot',
                authDir: '../auth_info'
            };
        }

        this.app = express();
        this.server = http.createServer(this.app);
        this.wss = new WebSocket.Server({ port: 3001 });
        this.clients = new Map();
        this.botProcess = null;
        this.sessions = new Map();
        this.whatsappSockets = new Map();
        this.phoneNumbers = new Map(); // Tracking des numéros de téléphone par session
        this.port = process.env.PORT || 3000;
        this.authDir = path.resolve(botConfig.authDir || path.join(__dirname, '..', 'auth_info'));
        this.botFile = path.resolve(botConfig.botFile || path.join(__dirname, '..', 'bot_with_fallback.js'));
        this.botName = botConfig.botName || 'JUXT_RTS Bot';
        
        // Créer le logger Pino
        this.logger = pino({
            level: 'info',
            transport: {
                target: 'pino-pretty',
                options: {
                    colorize: true
                }
            }
        });
        
        // Créer le dossier auth_info s'il n'existe pas
        if (!fs.existsSync(this.authDir)) {
            fs.mkdirSync(this.authDir, { recursive: true });
        }
        
        this.setupExpress();
        this.setupWebSocket();
        this.loadExistingSessions();
    }

    setupExpress() {
        // Servir les fichiers statiques
        this.app.use(express.static(path.join(__dirname)));
        
        // Route principale
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'index.html'));
        });

        // Route pour les sessions
        this.app.get('/sessions', (req, res) => {
            res.json(Array.from(this.sessions.keys()));
        });

        // Route pour démarrer le bot
        this.app.post('/start-bot', (req, res) => {
            this.startBot();
            res.json({ success: true, message: 'Bot démarré' });
        });

        // Route pour arrêter le bot
        this.app.post('/stop-bot', (req, res) => {
            this.stopBot();
            res.json({ success: true, message: 'Bot arrêté' });
        });
    }

    setupWebSocket() {
        this.wss.on('connection', (ws, req) => {
            const clientId = Date.now().toString();
            this.clients.set(clientId, ws);
            
            console.log(`Client connecté: ${clientId}`);
            
            ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message);
                    this.handleClientMessage(clientId, data);
                } catch (error) {
                    console.error('Erreur parsing message client:', error);
                    this.sendToClient(clientId, {
                        type: 'error',
                        message: 'Format de message invalide'
                    });
                }
            });

            ws.on('close', () => {
                console.log(`Client déconnecté: ${clientId}`);
                this.clients.delete(clientId);
            });

            ws.on('error', (error) => {
                console.error(`Erreur WebSocket client ${clientId}:`, error);
                this.clients.delete(clientId);
            });

            // Envoyer la liste des sessions disponibles
            this.sendToClient(clientId, {
                type: 'sessions',
                sessions: Array.from(this.sessions.keys())
            });
        });
    }

    loadExistingSessions() {
        try {
            console.log('Chargement des sessions existantes...');
            
            if (!fs.existsSync(this.authDir)) {
                console.log('Aucun dossier auth_info trouvé');
                return;
            }

            const sessionDirs = fs.readdirSync(this.authDir, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name)
                .filter(name => name.startsWith('session_'));

            // Trier les sessions par numéro pour un ordre logique
            sessionDirs.sort((a, b) => {
                const numA = parseInt(a.match(/^session_(\d+)$/)?.[1] || '0');
                const numB = parseInt(b.match(/^session_(\d+)$/)?.[1] || '0');
                return numA - numB;
            });

            sessionDirs.forEach(sessionId => {
                const sessionDir = path.join(this.authDir, sessionId);
                
                // Vérifier si la session a des fichiers d'authentification valides
                const credsFile = path.join(sessionDir, 'creds.json');
                const hasValidAuth = fs.existsSync(credsFile);
                
                const sessionInfo = {
                    type: 'existing',
                    status: hasValidAuth ? 'disconnected' : 'invalid',
                    createdAt: new Date(),
                    sessionDir: sessionDir,
                    hasValidAuth: hasValidAuth
                };

                this.sessions.set(sessionId, sessionInfo);
                console.log(`✅ Session chargée: ${sessionId} (${hasValidAuth ? 'valide' : 'invalide'})`);
            });

            console.log(`${sessionDirs.length} session(s) chargée(s) depuis auth_info`);
        } catch (error) {
            console.error('Erreur lors du chargement des sessions:', error);
        }
    }

    handleClientMessage(clientId, data) {
        console.log(`Message de ${clientId}:`, data);

        switch (data.type) {
            case 'request':
                this.handleRequest(clientId, data);
                break;
            case 'validate_session':
                this.validateSession(clientId, data.sessionId);
                break;
            case 'start_bot':
                this.startBot();
                break;
            case 'stop_bot':
                this.stopBot();
                break;
            case 'cancel':
                this.cancelOperation(clientId);
                break;
                case 'reset_sessions':
                    this.resetSessions(clientId);
                    break;
                case 'list_active_sessions':
                    this.listActiveSessions(clientId);
                    break;
            case 'check_session_status':
                this.checkSessionStatus(clientId, data.sessions);
                break;
            case 'check_specific_session':
                this.checkSpecificSession(clientId, data.sessionId);
                break;
            default:
                console.log('Type de message non reconnu:', data.type);
        }
    }

    async handleRequest(clientId, data) {
        const { content, data: requestData } = data;

        try {
            switch (content) {
                case 'qrcode':
                    await this.generateQRCode(clientId, requestData);
                    break;
                case 'pairing':
                    await this.generatePairingCode(clientId, requestData);
                    break;
                default:
                    this.sendToClient(clientId, {
                        type: 'error',
                        message: 'Type de requête non supporté'
                    });
            }
        } catch (error) {
            console.error('Erreur traitement requête:', error);
            this.sendToClient(clientId, {
                type: 'error',
                message: 'Erreur lors du traitement de la requête'
            });
        }
    }

    async generateQRCode(clientId, data) {
        try {
            const sessionId = data.customSession || this.generateSessionId();
            const sessionDir = path.join(this.authDir, sessionId);
            
            // Vérifier si une session existe déjà
            if (this.sessions.has(sessionId)) {
                const session = this.sessions.get(sessionId);
                console.log(`🔍 Session trouvée: ${sessionId}, statut: ${session.status}`);
                
                if (session.status === 'connected') {
                    console.log('✅ Session déjà connectée:', sessionId);
                    this.sendToClient(clientId, {
                        type: 'connected',
                        message: 'Session déjà connectée'
                    });
                    return;
                } else if (session.status === 'disconnected' && fs.existsSync(sessionDir)) {
                    // Session existe mais déconnectée, essayer de se reconnecter
                    console.log('🔄 Tentative de reconnexion pour la session:', sessionId);
                    this.sendToClient(clientId, {
                        type: 'status',
                        message: 'Tentative de reconnexion...'
                    });
                } else {
                    // Session existe mais pas dans le bon état, ne pas générer de QR
                    console.log('❌ Session existe mais pas dans le bon état:', sessionId);
                    this.sendToClient(clientId, {
                        type: 'error',
                        message: 'Session existe mais pas dans le bon état'
                    });
                    return;
                }
            } else {
                // Nouvelle session - vérifier s'il y a des conflits avec des sessions actives
                const activeSessions = Array.from(this.sessions.entries()).filter(([id, session]) => 
                    session.status === 'connected' || session.status === 'connecting'
                );
                
                if (activeSessions.length > 0) {
                    console.log(`⚠️ ${activeSessions.length} session(s) active(s) détectée(s)`);
                    // Permettre la création d'une nouvelle session pour un numéro différent
                    console.log('🆕 Création d\'une nouvelle session pour un numéro différent');
                    console.log('💡 Note: Les conflits de numéros seront détectés lors de la connexion WhatsApp');
                }
                
                // Créer une nouvelle session
                this.sessions.set(sessionId, {
                    type: 'qrcode',
                    status: 'pending',
                    createdAt: new Date(),
                    clientId: clientId,
                    sessionDir: sessionDir
                });
            }

            // Nettoyer les anciennes connexions pour cette session
            if (this.whatsappSockets.has(sessionId)) {
                console.log('🧹 Nettoyage de l\'ancienne connexion pour:', sessionId);
                this.whatsappSockets.delete(sessionId);
            }

            // Utiliser Baileys pour créer la session
            const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
            
            const socket = makeWASocket({
                auth: state,
                printQRInTerminal: false,
                logger: this.logger,
                browser: ['JUXT_RTS Bot', 'Chrome', '1.0.0']
            });

            // Stocker la socket et les infos de session
            this.whatsappSockets.set(sessionId, { socket, saveCreds });
            this.sessions.set(sessionId, {
                type: 'qrcode',
                status: 'pending',
                createdAt: new Date(),
                clientId: clientId,
                sessionDir: sessionDir
            });

            // Gérer les événements de la socket
            socket.ev.on('connection.update', (update) => {
                const { connection, lastDisconnect, qr } = update;
                
                console.log('🔍 Événement connection.update:', { 
                    connection, 
                    qr: qr ? 'présent' : 'absent',
                    lastDisconnect: lastDisconnect ? 'présent' : 'absent'
                });
                
                if (qr) {
                    console.log('📱 QR Code reçu, génération en cours...');
                    // Générer le QR Code
                    qrcode.toDataURL(qr, {
                        width: 300,
                        margin: 2,
                        color: {
                            dark: '#000000',
                            light: '#FFFFFF'
                        }
                    }).then(qrCodeImage => {
                        console.log('✅ QR Code généré, envoi au client...');
                        this.sendToClient(clientId, {
                            type: 'qrcode',
                            data: qrCodeImage
                        });
                    }).catch(error => {
                        console.error('❌ Erreur génération QR Code:', error);
                        this.sendToClient(clientId, {
                            type: 'error',
                            message: 'Erreur lors de la génération du QR Code'
                        });
                    });
                }

                if (connection === 'close') {
                    const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                    const isConflict = lastDisconnect?.error?.output?.statusCode === 440 || lastDisconnect?.error?.output?.statusCode === 515; // Codes de conflit
                    
                    console.log('❌ Connexion fermée:', lastDisconnect?.error, ', reconnexion:', shouldReconnect);
                    
                    if (isConflict) {
                        console.log('⚠️ Conflit de session détecté - Même numéro de téléphone utilisé');
                        
                        // Trouver les sessions actives
                        const activeSessions = Array.from(this.sessions.entries()).filter(([id, session]) => 
                            session.status === 'connected'
                        );
                        
                        let conflictMessage = '❌ Conflit détecté : Ce numéro de téléphone est déjà utilisé.\n\n';
                        conflictMessage += '📱 Sessions actives détectées :\n';
                        activeSessions.forEach(([id, session]) => {
                            conflictMessage += `• ${id} (${session.phoneNumber || 'Numéro inconnu'})\n`;
                        });
                        conflictMessage += '\n💡 Solutions :\n';
                        conflictMessage += '1. Utilisez un numéro différent\n';
                        conflictMessage += '2. Déconnectez une session existante\n';
                        conflictMessage += '3. Utilisez une session existante (session_1, session_2, etc.)';
                        
                        this.sendToClient(clientId, {
                            type: 'error',
                            message: conflictMessage
                        });
                        
                        // Nettoyer la session en conflit
                        this.sessions.delete(sessionId);
                        this.whatsappSockets.delete(sessionId);
                        // Nettoyer le tracking du numéro de téléphone
                        for (const [phone, sid] of this.phoneNumbers.entries()) {
                            if (sid === sessionId) {
                                this.phoneNumbers.delete(phone);
                                console.log(`🧹 Numéro de téléphone supprimé du tracking: ${phone}`);
                                break;
                            }
                        }
                    } else if (shouldReconnect) {
                        console.log('🔄 Tentative de reconnexion...');
                        this.sendToClient(clientId, {
                            type: 'status',
                            message: 'Reconnexion en cours...'
                        });
                        // Reconnexion automatique après 3 secondes
                        setTimeout(() => {
                            this.generateQRCode(clientId, { customSession: sessionId });
                        }, 3000);
                    } else {
                        console.log('🗑️ Suppression de la session:', sessionId);
                        this.sessions.delete(sessionId);
                        this.whatsappSockets.delete(sessionId);
                    }
                } else if (connection === 'open') {
                    console.log('🎉 Connexion WhatsApp établie pour la session:', sessionId);
                    this.handleWhatsAppConnection(sessionId);
                } else if (connection === 'connecting') {
                    console.log('🔄 Connexion en cours...');
                    this.sendToClient(clientId, {
                        type: 'status',
                        message: 'Connexion en cours...'
                    });
                }
            });

            socket.ev.on('creds.update', saveCreds);

            this.sendToClient(clientId, {
                type: 'session',
                session: sessionId
            });

        } catch (error) {
            console.error('Erreur génération QR Code:', error);
            this.sendToClient(clientId, {
                type: 'error',
                message: 'Erreur lors de la génération du QR Code'
            });
        }
    }

    async generatePairingCode(clientId, data) {
        try {
            const { phoneNumber, customSession } = data;
            const sessionId = customSession || this.generateSessionId();
            const sessionDir = path.join(this.authDir, sessionId);
            
            // Ne pas créer le dossier de session ici, seulement après connexion réussie

            // Utiliser Baileys pour créer la session
            const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
            
            const socket = makeWASocket({
                auth: state,
                printQRInTerminal: false,
                logger: this.logger,
                browser: ['JUXT_RTS Bot', 'Chrome', '1.0.0']
            });

            // Stocker la socket et les infos de session
            this.whatsappSockets.set(sessionId, { socket, saveCreds });
            this.sessions.set(sessionId, {
                type: 'pairing',
                status: 'pending',
                phoneNumber: phoneNumber,
                createdAt: new Date(),
                clientId: clientId,
                sessionDir: sessionDir
            });

            // Gérer les événements de la socket
            socket.ev.on('connection.update', (update) => {
                const { connection, lastDisconnect } = update;
                
                if (connection === 'close') {
                    const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                    console.log('Connexion fermée:', lastDisconnect?.error, ', reconnexion:', shouldReconnect);
                    
                    if (shouldReconnect) {
                        this.generatePairingCode(clientId, data);
                    } else {
                        this.sessions.delete(sessionId);
                        this.whatsappSockets.delete(sessionId);
                    }
                } else if (connection === 'open') {
                    console.log('Connexion WhatsApp établie pour la session:', sessionId);
                    this.handleWhatsAppConnection(sessionId);
                }
            });

            socket.ev.on('creds.update', saveCreds);

            // Générer un code de liaison aléatoire
            const pairingCode = Math.random().toString(36).substring(2, 8).toUpperCase();
            
            this.sendToClient(clientId, {
                type: 'pairing',
                data: pairingCode
            });

            this.sendToClient(clientId, {
                type: 'session',
                session: sessionId
            });

        } catch (error) {
            console.error('Erreur génération code de liaison:', error);
            this.sendToClient(clientId, {
                type: 'error',
                message: 'Erreur lors de la génération du code de liaison'
            });
        }
    }

    validateSession(clientId, sessionId) {
        const session = this.sessions.get(sessionId);
        const sessionDir = path.join(this.authDir, sessionId);
        
        if (session) {
            this.sendToClient(clientId, {
                type: 'session_validation',
                session: sessionId,
                valid: true
            });
        } else if (fs.existsSync(sessionDir)) {
            // Vérifier si le dossier de session existe dans auth_info
            this.sendToClient(clientId, {
                type: 'session_validation',
                session: sessionId,
                valid: true,
                reason: 'Session trouvée dans auth_info'
            });
        } else {
            this.sendToClient(clientId, {
                type: 'session_validation',
                session: sessionId,
                valid: false,
                reason: 'Session non trouvée'
            });
        }
    }

    handleWhatsAppConnection(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            // Créer le dossier de session seulement après connexion réussie
            const sessionDir = path.join(this.authDir, sessionId);
            if (!fs.existsSync(sessionDir)) {
                fs.mkdirSync(sessionDir, { recursive: true });
                console.log(`📁 Dossier de session créé: ${sessionDir}`);
            }
            
            // Mettre à jour le chemin du dossier de session
            session.sessionDir = sessionDir;
            session.status = 'connected';
            session.connectedAt = new Date();
            
            // Tracker le numéro de téléphone si disponible
            if (session.phoneNumber) {
                this.phoneNumbers.set(session.phoneNumber, sessionId);
                console.log(`📱 Numéro de téléphone tracké: ${session.phoneNumber} → ${sessionId}`);
            }
            
            this.sendToClient(session.clientId, {
                type: 'connected'
            });

            // Notifier tous les clients
            this.broadcast({
                type: 'session_updated',
                sessionId: sessionId,
                status: 'connected'
            });

            console.log(`✅ Session ${sessionId} connectée à WhatsApp`);
            
            // Démarrer automatiquement le bot après connexion
            console.log(`🚀 Démarrage automatique du bot pour la session ${sessionId}`);
            this.startBot();
        }
    }


    startBot() {
        if (this.botProcess) {
            console.log('Bot déjà en cours d\'exécution');
            this.broadcast({
                type: 'bot_started',
                message: 'Bot déjà en cours d\'exécution'
            });
            return;
        }

        console.log('Démarrage du bot...');
        
        // Trouver une session connectée
        const connectedSession = Array.from(this.sessions.entries()).find(([id, session]) => session.status === 'connected');
        
        if (!connectedSession) {
            this.broadcast({
                type: 'error',
                message: 'Aucune session WhatsApp connectée. Veuillez d\'abord vous connecter.'
            });
            return;
        }

        const [sessionId, session] = connectedSession;
        console.log(`Démarrage du bot avec la session: ${sessionId}`);
        
        // Démarrer le bot avec le fichier configuré
        const botFileName = path.basename(this.botFile);
        const botDir = path.dirname(this.botFile);
        
        this.botProcess = spawn('node', [botFileName], {
            cwd: botDir,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: {
                ...process.env,
                SESSION_ID: sessionId,
                SESSION_DIR: session.sessionDir
            }
        });

        this.botProcess.stdout.on('data', (data) => {
            console.log('Bot stdout:', data.toString());
        });

        this.botProcess.stderr.on('data', (data) => {
            console.error('Bot stderr:', data.toString());
        });

        this.botProcess.on('close', (code) => {
            console.log(`Bot arrêté avec le code ${code}`);
            this.botProcess = null;
            this.broadcast({
                type: 'bot_stopped'
            });
        });

        this.botProcess.on('error', (error) => {
            console.error('Erreur bot:', error);
            this.botProcess = null;
            this.broadcast({
                type: 'error',
                message: 'Erreur lors du démarrage du bot'
            });
        });

        // Notifier que le bot a démarré
        setTimeout(() => {
            this.broadcast({
                type: 'bot_started'
            });
        }, 2000);
    }

    stopBot() {
        if (this.botProcess) {
            console.log('Arrêt du bot...');
            this.botProcess.kill('SIGTERM');
            this.botProcess = null;
            
            this.broadcast({
                type: 'bot_stopped'
            });
        }
    }

    cancelOperation(clientId) {
        // Annuler l'opération en cours pour ce client
        console.log(`Annulation opération pour client ${clientId}`);
        
        this.sendToClient(clientId, {
            type: 'cancelled'
        });
    }

    resetSessions(clientId) {
        console.log('Reset des sessions demandé par le client');
        
        // Arrêter le bot s'il est en cours d'exécution
        if (this.botProcess) {
            this.stopBot();
        }
        
        // Nettoyer les sessions en mémoire
        this.sessions.clear();
        this.whatsappSockets.clear();
        
        // Recharger les sessions existantes
        this.loadExistingSessions();
        
        this.sendToClient(clientId, {
            type: 'sessions_reset',
            message: 'Sessions réinitialisées'
        });
        
        console.log('Sessions réinitialisées');
    }

    listActiveSessions(clientId) {
        console.log('Liste des sessions actives demandée');
        
        const activeSessions = Array.from(this.sessions.entries()).filter(([id, session]) => 
            session.status === 'connected'
        );
        
        const sessionList = activeSessions.map(([id, session]) => ({
            id: id,
            phoneNumber: session.phoneNumber || 'Numéro inconnu',
            connectedAt: session.connectedAt || 'Inconnu'
        }));
        
        this.sendToClient(clientId, {
            type: 'active_sessions_list',
            sessions: sessionList,
            count: sessionList.length
        });
        
        console.log(`${sessionList.length} session(s) active(s) trouvée(s)`);
    }

    checkSessionStatus(clientId, sessions) {
        console.log('Vérification du statut des sessions:', sessions);
        
        // Vérifier s'il y a des sessions connectées
        const connectedSessions = Array.from(this.sessions.entries()).filter(([id, session]) => 
            session.status === 'connected' && sessions.includes(id)
        );
        
        if (connectedSessions.length > 0) {
            const [sessionId, session] = connectedSessions[0];
            console.log(`Session connectée trouvée: ${sessionId}`);
            
            // Vérifier aussi si le bot est en cours d'exécution
            const botRunning = this.botProcess && !this.botProcess.killed;
            
            this.sendToClient(clientId, {
                type: 'session_connected',
                sessionId: sessionId,
                message: 'Session déjà connectée',
                botRunning: botRunning
            });
        } else {
            console.log('Aucune session connectée trouvée');
            // Vérifier si des sessions existent mais sont déconnectées
            const existingSessions = Array.from(this.sessions.entries()).filter(([id, session]) => 
                sessions.includes(id) && session.status === 'disconnected'
            );
            
            if (existingSessions.length > 0) {
                console.log('Sessions existantes mais déconnectées trouvées');
                this.sendToClient(clientId, {
                    type: 'no_connected_sessions',
                    message: 'Sessions existantes mais déconnectées'
                });
            } else {
                this.sendToClient(clientId, {
                    type: 'no_connected_sessions',
                    message: 'Aucune session connectée'
                });
            }
        }
    }

    checkSpecificSession(clientId, sessionId) {
        console.log('Vérification de la session spécifique:', sessionId);
        
        // Vérifier si cette session spécifique existe
        if (this.sessions.has(sessionId)) {
            const session = this.sessions.get(sessionId);
            console.log(`Session spécifique trouvée: ${sessionId}, statut: ${session.status}`);
            
            if (session.status === 'connected') {
                console.log(`Session spécifique connectée: ${sessionId}`);
                
                // Vérifier aussi si le bot est en cours d'exécution
                const botRunning = this.botProcess && !this.botProcess.killed;
                
                this.sendToClient(clientId, {
                    type: 'specific_session_connected',
                    sessionId: sessionId,
                    message: 'Session déjà connectée - Boutons du bot disponibles',
                    botRunning: botRunning
                });
            } else {
                console.log(`Session spécifique trouvée mais non connectée: ${sessionId}`);
                // Envoyer un message pour indiquer que la session existe mais n'est pas connectée
                this.sendToClient(clientId, {
                    type: 'session_validation',
                    session: sessionId,
                    valid: true,
                    reason: 'Session trouvée mais non connectée'
                });
            }
        } else {
            console.log(`Session spécifique non trouvée: ${sessionId}`);
            // Vérifier si le dossier de session existe dans auth_info
            const sessionDir = path.join(this.authDir, sessionId);
            if (fs.existsSync(sessionDir)) {
                console.log(`Dossier de session trouvé: ${sessionId}`);
                this.sendToClient(clientId, {
                    type: 'session_validation',
                    session: sessionId,
                    valid: true,
                    reason: 'Session trouvée dans auth_info'
                });
            } else {
                this.sendToClient(clientId, {
                    type: 'session_validation',
                    session: sessionId,
                    valid: false,
                    reason: 'Session non trouvée'
                });
            }
        }
    }

    generateSessionId() {
        // Compter les sessions existantes pour générer le prochain numéro
        const existingSessions = Array.from(this.sessions.keys());
        const sessionNumbers = existingSessions
            .map(sessionId => {
                const match = sessionId.match(/^session_(\d+)$/);
                return match ? parseInt(match[1]) : 0;
            })
            .filter(num => num > 0);
        
        const nextNumber = sessionNumbers.length > 0 ? Math.max(...sessionNumbers) + 1 : 1;
        return `session_${nextNumber}`;
    }

    sendToClient(clientId, message) {
        const client = this.clients.get(clientId);
        if (client && client.readyState === WebSocket.OPEN) {
            console.log('📤 Envoi message au client:', message.type);
            client.send(JSON.stringify(message));
        } else {
            console.log('❌ Client non disponible pour l\'envoi:', clientId);
        }
    }

    broadcast(message) {
        this.clients.forEach((client, clientId) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(message));
            }
        });
    }

    start() {
        this.server.listen(this.port, () => {
            console.log(`🚀 Interface web démarrée sur le port ${this.port}`);
            console.log(`📱 Accédez à: http://localhost:${this.port}`);
            console.log(`🔗 WebSocket: ws://localhost:${this.port}`);
        });
    }
}

// Démarrer le serveur
const server = new WebInterfaceServer();
server.start();

// Gestion des signaux pour un arrêt propre
process.on('SIGINT', () => {
    console.log('\n🛑 Arrêt du serveur...');
    server.stopBot();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Arrêt du serveur...');
    server.stopBot();
    process.exit(0);
});

module.exports = WebInterfaceServer;

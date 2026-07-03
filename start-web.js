#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class WebBotManager {
    constructor() {
        this.webServer = null;
        this.botProcess = null;
        this.isRunning = false;
    }

    async start() {
        console.log('🚀 Démarrage de JUXT_RTS Bot avec interface web...\n');

        try {
            // Vérifier si le dossier web-interface existe
            const webInterfacePath = path.join(__dirname, 'web-interface');
            if (!fs.existsSync(webInterfacePath)) {
                console.error('❌ Dossier web-interface non trouvé !');
                process.exit(1);
            }

            // Vérifier si les dépendances sont installées
            const packageJsonPath = path.join(webInterfacePath, 'package.json');
            const nodeModulesPath = path.join(webInterfacePath, 'node_modules');
            
            if (!fs.existsSync(nodeModulesPath)) {
                console.log('📦 Installation des dépendances de l\'interface web...');
                await this.installDependencies(webInterfacePath);
            }

            // Démarrer le serveur web
            console.log('🌐 Démarrage du serveur web...');
            this.startWebServer(webInterfacePath);

            // Attendre un peu pour que le serveur web démarre
            await this.sleep(3000);

            console.log('\n✅ Interface web démarrée avec succès !');
            console.log('📱 Accédez à: http://localhost:3000');
            console.log('🔗 WebSocket: ws://localhost:3000');
            console.log('\n💡 Utilisez l\'interface web pour gérer les sessions WhatsApp');
            console.log('🛑 Appuyez sur Ctrl+C pour arrêter\n');

            // Gestion des signaux pour un arrêt propre
            process.on('SIGINT', () => this.stop());
            process.on('SIGTERM', () => this.stop());

        } catch (error) {
            console.error('❌ Erreur lors du démarrage:', error.message);
            process.exit(1);
        }
    }

    async installDependencies(webInterfacePath) {
        return new Promise((resolve, reject) => {
            const npm = spawn('npm', ['install'], {
                cwd: webInterfacePath,
                stdio: 'inherit',
                shell: true
            });

            npm.on('close', (code) => {
                if (code === 0) {
                    console.log('✅ Dépendances installées avec succès');
                    resolve();
                } else {
                    reject(new Error(`Erreur installation dépendances: code ${code}`));
                }
            });

            npm.on('error', (error) => {
                reject(new Error(`Erreur npm: ${error.message}`));
            });
        });
    }

    startWebServer(webInterfacePath) {
        this.webServer = spawn('node', ['server.js'], {
            cwd: webInterfacePath,
            stdio: 'inherit',
            shell: true
        });

        this.webServer.on('error', (error) => {
            console.error('❌ Erreur serveur web:', error.message);
        });

        this.webServer.on('close', (code) => {
            if (code !== 0) {
                console.error(`❌ Serveur web arrêté avec le code ${code}`);
            }
        });

        this.isRunning = true;
    }

    async stop() {
        console.log('\n🛑 Arrêt de JUXT_RTS Bot...');

        if (this.webServer) {
            console.log('🌐 Arrêt du serveur web...');
            this.webServer.kill('SIGTERM');
        }

        if (this.botProcess) {
            console.log('🤖 Arrêt du bot...');
            this.botProcess.kill('SIGTERM');
        }

        this.isRunning = false;
        console.log('✅ Arrêt terminé');
        process.exit(0);
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Démarrer le gestionnaire
const manager = new WebBotManager();
manager.start().catch(error => {
    console.error('❌ Erreur fatale:', error.message);
    process.exit(1);
});

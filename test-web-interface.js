#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🧪 Test de l\'interface web JUXT_RTS Bot...\n');

// Vérifier les fichiers requis
const requiredFiles = [
    'web-interface/index.html',
    'web-interface/server.js',
    'web-interface/package.json',
    'web-interface/config.js',
    'start-web.js',
    'start-web.bat',
    'start-web.sh'
];

console.log('📁 Vérification des fichiers...');
let allFilesExist = true;

requiredFiles.forEach(file => {
    if (fs.existsSync(file)) {
        console.log(`✅ ${file}`);
    } else {
        console.log(`❌ ${file} - MANQUANT`);
        allFilesExist = false;
    }
});

if (!allFilesExist) {
    console.log('\n❌ Certains fichiers sont manquants !');
    process.exit(1);
}

// Vérifier le package.json de l'interface web
console.log('\n📦 Vérification des dépendances...');
try {
    const packageJson = JSON.parse(fs.readFileSync('web-interface/package.json', 'utf8'));
    const requiredDeps = ['express', 'ws', 'qrcode', '@whiskeysockets/baileys'];
    
    requiredDeps.forEach(dep => {
        if (packageJson.dependencies && packageJson.dependencies[dep]) {
            console.log(`✅ ${dep}: ${packageJson.dependencies[dep]}`);
        } else {
            console.log(`❌ ${dep} - MANQUANT`);
            allFilesExist = false;
        }
    });
} catch (error) {
    console.log('❌ Erreur lecture package.json:', error.message);
    allFilesExist = false;
}

// Vérifier la structure des dossiers
console.log('\n📂 Vérification de la structure...');
const requiredDirs = ['web-interface', 'auth_info'];

requiredDirs.forEach(dir => {
    if (fs.existsSync(dir)) {
        console.log(`✅ ${dir}/`);
    } else {
        console.log(`❌ ${dir}/ - MANQUANT`);
        allFilesExist = false;
    }
});

// Créer le dossier auth_info s'il n'existe pas
if (!fs.existsSync('auth_info')) {
    fs.mkdirSync('auth_info', { recursive: true });
    console.log('✅ auth_info/ créé');
}

// Vérifier les permissions des scripts
console.log('\n🔧 Vérification des permissions...');
const scripts = ['start-web.sh'];

scripts.forEach(script => {
    if (fs.existsSync(script)) {
        try {
            fs.accessSync(script, fs.constants.X_OK);
            console.log(`✅ ${script} - Exécutable`);
        } catch (error) {
            console.log(`⚠️  ${script} - Pas exécutable (normal sur Windows)`);
        }
    }
});

if (allFilesExist) {
    console.log('\n🎉 Tous les tests sont passés !');
    console.log('\n📋 Prochaines étapes :');
    console.log('1. Installez les dépendances : npm run web:install');
    console.log('2. Démarrez l\'interface : npm run web');
    console.log('3. Accédez à : http://localhost:3000');
    console.log('\n🚀 L\'interface web est prête à être utilisée !');
} else {
    console.log('\n❌ Certains tests ont échoué !');
    console.log('Veuillez corriger les problèmes avant de continuer.');
    process.exit(1);
}

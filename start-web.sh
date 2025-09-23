#!/bin/bash

echo ""
echo "========================================"
echo "    JUXT_RTS BOT - INTERFACE WEB"
echo "========================================"
echo ""
echo "Démarrage de l'interface web..."
echo ""

# Vérifier si Node.js est installé
if ! command -v node &> /dev/null; then
    echo "ERREUR: Node.js n'est pas installé !"
    echo "Veuillez installer Node.js depuis https://nodejs.org"
    exit 1
fi

# Vérifier si le dossier web-interface existe
if [ ! -d "web-interface" ]; then
    echo "ERREUR: Dossier web-interface non trouvé !"
    echo "Veuillez exécuter ce script depuis la racine du projet"
    exit 1
fi

# Aller dans le dossier web-interface
cd web-interface

# Vérifier si node_modules existe
if [ ! -d "node_modules" ]; then
    echo "Installation des dépendances..."
    npm install
    if [ $? -ne 0 ]; then
        echo "ERREUR: Échec de l'installation des dépendances !"
        exit 1
    fi
fi

# Rendre le script exécutable
chmod +x ../start-web.sh

# Démarrer le serveur
echo ""
echo "Démarrage du serveur web..."
echo ""
echo "========================================"
echo "   Interface accessible sur :"
echo "   http://localhost:3000"
echo "========================================"
echo ""
echo "Appuyez sur Ctrl+C pour arrêter"
echo ""

node server.js

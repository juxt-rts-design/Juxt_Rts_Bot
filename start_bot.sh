#!/bin/bash

echo "🤖 Démarrage de Juxt_Rts Bot avec système de fallback JSON"
echo

# Vérifier si Node.js est installé
if ! command -v node &> /dev/null; then
    echo "❌ Node.js n'est pas installé ou n'est pas dans le PATH"
    echo "Veuillez installer Node.js depuis https://nodejs.org/"
    exit 1
fi

# Vérifier si les dépendances sont installées
if [ ! -d "node_modules" ]; then
    echo "📦 Installation des dépendances..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Erreur lors de l'installation des dépendances"
        exit 1
    fi
fi

# Vérifier si le fichier .env existe
if [ ! -f ".env" ]; then
    echo "⚠️ Fichier .env non trouvé"
    echo "Copie du fichier d'exemple..."
    cp env.example .env
    echo
    echo "📝 Veuillez configurer votre fichier .env avec vos clés API"
    echo "Puis relancez ce script"
    exit 0
fi

# Créer les dossiers nécessaires
mkdir -p images videos auth_info

echo "✅ Configuration vérifiée"
echo "🚀 Démarrage du bot..."
echo

# Démarrer le bot
node server_with_fallback.js

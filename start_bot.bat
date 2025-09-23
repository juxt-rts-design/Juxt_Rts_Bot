@echo off
echo 🤖 Démarrage de Juxt_Rts Bot avec système de fallback JSON
echo.

REM Vérifier si Node.js est installé
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js n'est pas installé ou n'est pas dans le PATH
    echo Veuillez installer Node.js depuis https://nodejs.org/
    pause
    exit /b 1
)

REM Vérifier si les dépendances sont installées
if not exist "node_modules" (
    echo 📦 Installation des dépendances...
    npm install
    if %errorlevel% neq 0 (
        echo ❌ Erreur lors de l'installation des dépendances
        pause
        exit /b 1
    )
)

REM Vérifier si le fichier .env existe
if not exist ".env" (
    echo ⚠️ Fichier .env non trouvé
    echo Copie du fichier d'exemple...
    copy env.example .env
    echo.
    echo 📝 Veuillez configurer votre fichier .env avec vos clés API
    echo Puis relancez ce script
    pause
    exit /b 0
)

REM Créer les dossiers nécessaires
if not exist "images" mkdir images
if not exist "videos" mkdir videos
if not exist "auth_info" mkdir auth_info

echo ✅ Configuration vérifiée
echo 🚀 Démarrage du bot...
echo.

REM Démarrer le bot
node server_with_fallback.js

pause

@echo off
echo.
echo ========================================
echo    JUXT_RTS BOT - INTERFACE WEB
echo ========================================
echo.
echo Demarrage de l'interface web...
echo.

REM Verifier si Node.js est installe
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERREUR: Node.js n'est pas installe !
    echo Veuillez installer Node.js depuis https://nodejs.org
    pause
    exit /b 1
)

REM Verifier si le dossier web-interface existe
if not exist "web-interface" (
    echo ERREUR: Dossier web-interface non trouve !
    echo Veuillez executer ce script depuis la racine du projet
    pause
    exit /b 1
)

REM Aller dans le dossier web-interface
cd web-interface

REM Verifier si node_modules existe
if not exist "node_modules" (
    echo Installation des dependances...
    npm install
    if %errorlevel% neq 0 (
        echo ERREUR: Echec de l'installation des dependances !
        pause
        exit /b 1
    )
)

REM Demarrer le serveur
echo.
echo Demarrage du serveur web...
echo.
echo ========================================
echo   Interface accessible sur :
echo   http://localhost:3000
echo ========================================
echo.
echo Appuyez sur Ctrl+C pour arreter
echo.

node server.js

pause

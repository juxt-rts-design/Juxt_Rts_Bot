@echo off
echo 🔄 Redémarrage du Juxt_Rts Bot...
echo.

echo 🛑 Arrêt du bot précédent...
taskkill /f /im node.exe >nul 2>&1

echo ⏳ Attente de 3 secondes...
timeout /t 3 /nobreak >nul

echo 🚀 Démarrage du bot...
npm start

pause

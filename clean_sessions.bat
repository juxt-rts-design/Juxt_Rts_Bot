@echo off
echo 🧹 Nettoyage des sessions WhatsApp...
echo.

echo 🛑 Arrêt du bot...
taskkill /f /im node.exe >nul 2>&1

echo ⏳ Attente de 2 secondes...
timeout /t 2 /nobreak >nul

echo 🗑️ Suppression des sessions corrompues...
if exist auth_info (
    rmdir /s /q auth_info
    echo ✅ Sessions supprimées
) else (
    echo ℹ️ Aucune session à supprimer
)

echo 📁 Création du nouveau dossier...
mkdir auth_info

echo ✅ Nettoyage terminé !
echo.
echo 🚀 Redémarrage du bot...
npm start

pause

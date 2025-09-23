@echo off
echo 🧹 Nettoyage de la session WhatsApp corrompue...
echo.

echo ⏹️ Arrêt du bot (si en cours)...
taskkill /f /im node.exe >nul 2>&1

echo 🗑️ Suppression du dossier auth_info...
if exist "auth_info" (
    rmdir /s /q "auth_info"
    echo ✅ Dossier auth_info supprimé
) else (
    echo ℹ️ Dossier auth_info n'existe pas
)

echo 🗑️ Suppression des fichiers temporaires...
if exist "temp" (
    rmdir /s /q "temp"
    echo ✅ Dossier temp supprimé
)

echo.
echo 🚀 Redémarrage du bot...
echo.
echo 📱 Scanne le QR code qui va apparaître !
echo.

npm start

pause

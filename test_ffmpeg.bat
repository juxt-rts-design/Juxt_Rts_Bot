@echo off
echo 🧪 Test de FFmpeg...
echo.

echo Vérification de l'installation FFmpeg...
ffmpeg -version
echo.

echo Test de création d'un sticker simple...
echo Création d'un fichier test...
echo test > test.txt

echo Conversion test...
ffmpeg -f lavfi -i color=c=red:size=512x512:duration=1 -vf "scale=512:512" -y test_sticker.webp

if exist test_sticker.webp (
    echo ✅ FFmpeg fonctionne correctement !
    echo ✅ Le fichier test_sticker.webp a été créé
    del test_sticker.webp
) else (
    echo ❌ FFmpeg ne fonctionne pas correctement
    echo ❌ Vérifiez l'installation de FFmpeg
)

del test.txt
echo.
echo Test terminé !
pause

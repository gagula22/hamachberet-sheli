@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==================================================
echo   Deploy: "Upload everything to cloud" button
echo ==================================================
echo.

if exist ".git\index.lock" del /f /q ".git\index.lock"

echo Repairing index state...
git reset

echo Committing local changes...
git add -A
git commit -m "add Force-Upload-to-Cloud button (per-topic, visible results) for diagnosis + manual full push"

echo Syncing with GitHub...
git fetch origin
git merge origin/main -m "merge live"
if errorlevel 1 ( echo. & echo Merge conflict. Copy this window to Claude. & pause & exit /b 1 )

echo Pushing...
git push origin main
if errorlevel 1 ( echo. & echo Push failed - copy this window to Claude. & pause & exit /b 1 )

echo.
echo ==================================================
echo   DONE. Live in ~1-2 min.
echo   1) DESKTOP: Ctrl+Shift+R.
echo   2) Open the side menu - a green button
echo      "Upload everything to cloud" is at the bottom.
echo   3) Click it, wait, and send Claude the result popup.
echo ==================================================
echo.
pause

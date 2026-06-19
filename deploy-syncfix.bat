@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==================================================
echo   Deploy: fix sync crash (mergeArrayById on object)
echo ==================================================
echo.

if exist ".git\index.lock" del /f /q ".git\index.lock"

echo Repairing index state...
git reset

echo Committing local changes first (protect firebase-sync.js fix)...
git add -A
git commit -m "sync: fix crash when a maindoc key is an object (mergeArrayById) - this blocked all topic syncing"

echo Syncing with GitHub...
git fetch origin
git merge origin/main -m "merge live"
if errorlevel 1 (
  echo.
  echo Merge conflict. Nothing pushed. Copy this window to Claude.
  pause & exit /b 1
)

echo Pushing...
git push origin main
if errorlevel 1 ( echo. & echo Push failed - copy this window to Claude. & pause & exit /b 1 )

echo.
echo ==================================================
echo   DONE. Live in ~1-2 min.
echo   1) DESKTOP: Ctrl+Shift+R, wait ~30s (topics upload).
echo   2) PHONE (private window): reload - newer notebooks
echo      should now appear.
echo ==================================================
echo.
pause

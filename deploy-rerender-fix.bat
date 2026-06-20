@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==================================================
echo   Deploy: cloud-data re-render fix (phone shows 41)
echo   store v20 . app v32 . firebase-sync v32
echo ==================================================
echo.

REM Remove a stale git lock if one exists (safe if not present)
if exist ".git\index.lock" (
  echo Removing stale git lock...
  del /f /q ".git\index.lock"
)

echo Staging all changes...
git add -A

echo Committing...
git commit -m "Fix: re-render current view when cloud data lands (phone stuck on 23 -> shows all 41); guard editing + opt-out self-managed views"

echo Pushing to origin/main...
git push origin main
if errorlevel 1 (
  echo.
  echo  Push failed - copy this window and send it to Claude.
  echo.
  pause
  exit /b 1
)

echo.
echo ==================================================
echo   DONE. Live in ~1-2 min:
echo   https://gagula22.github.io/hamachberet-sheli
echo   Then on PHONE: open the site, Ctrl+Shift+R
echo   (or reinstall the PWA) and check all 41 notebooks.
echo ==================================================
echo.
pause

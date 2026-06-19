@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   Deploying: hamachberet-sheli  ^=^> GitHub
echo ============================================
echo.

REM Remove a stale git lock if one exists (safe if not present)
if exist ".git\index.lock" (
  echo Removing stale git lock...
  del /f /q ".git\index.lock"
)

echo Staging all changes...
git add -A

echo Committing...
git commit -m "PWA + cloud-first save + image quality/A4 width fix"

echo Pushing to origin/main...
git push origin main

echo.
echo ============================================
echo   Done. The site updates in about a minute:
echo   https://gagula22.github.io/hamachberet-sheli
echo   (Refresh with Ctrl+Shift+R)
echo ============================================
echo.
pause

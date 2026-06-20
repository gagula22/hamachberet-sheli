@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==================================================
echo   Deploy: ?lp=1 URL trigger for forced long-polling
echo   (fixes phone where Firestore Listen channel is blocked)
echo   firebase-sync v33
echo ==================================================
echo.

if exist ".git\index.lock" (
  echo Removing stale git lock...
  del /f /q ".git\index.lock"
)

echo Staging all changes...
git add -A

echo Committing...
git commit -m "Add ?lp=1 URL trigger to force Firestore long-polling per-device (fixes phone where onSnapshot Listen channel is blocked by Brave/mobile)"

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
echo   DONE. Live in ~1-2 min.
echo   Then on the PHONE open this exact URL:
echo   https://gagula22.github.io/hamachberet-sheli/?lp=1
echo   Wait, then reload normally and check all 41 notebooks.
echo ==================================================
echo.
pause

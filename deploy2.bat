@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==================================================
echo   Smart deploy (handles diverged history)
echo ==================================================
echo.

REM 1) clear a stuck git lock (safe if absent)
if exist ".git\index.lock" (
  echo Removing stuck git lock...
  del /f /q ".git\index.lock"
)

REM 2) clear any half-finished staging state (does NOT touch your files)
echo Resetting staging area...
git reset

REM 3) stage the real changes
echo Staging changes...
git add -A
git commit -m "notebook: image A4 width cap + quality fix; PWA" 2>nul

REM 4) reconcile with GitHub before pushing (rebase our commit on top)
echo Syncing with GitHub (rebase)...
git pull --rebase origin main
if errorlevel 1 (
  echo.
  echo **************************************************
  echo  Sync hit a conflict. NOTHING was pushed yet.
  echo  Do NOT worry - nothing is lost.
  echo  Please screenshot / copy this whole window
  echo  and send it to Claude to finish safely.
  echo **************************************************
  echo.
  pause
  exit /b 1
)

REM 5) push
echo Pushing to GitHub...
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
echo   DONE. Live in ~1 min:
echo   https://gagula22.github.io/hamachberet-sheli
echo   Refresh with Ctrl+Shift+R
echo ==================================================
echo.
pause

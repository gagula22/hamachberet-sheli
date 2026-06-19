@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==================================================
echo   Deploy: resilient per-topic cloud sync
echo ==================================================
echo.

if exist ".git\index.lock" del /f /q ".git\index.lock"

echo Repairing index state...
git reset

echo Committing local changes first (protect firebase-sync.js fix)...
git add -A
git commit -m "sync: per-topic writes so one heavy page can't block others (fixes phone missing newer notebooks)"

echo Syncing with GitHub...
git fetch origin
git merge origin/main -m "merge live"
if errorlevel 1 (
  echo.
  echo **************************************************
  echo  Merge conflict. Nothing pushed, nothing lost.
  echo  Do NOT auto-resolve. Copy this window to Claude.
  echo **************************************************
  pause & exit /b 1
)

echo Pushing...
git push origin main
if errorlevel 1 ( echo. & echo Push failed - copy this window to Claude. & pause & exit /b 1 )

echo.
echo ==================================================
echo   DONE. Live in ~1-2 min.
echo   1) Refresh DESKTOP with Ctrl+Shift+R, wait ~15s.
echo   2) On the PHONE: fully close the app and reopen.
echo   The newer notebooks should now appear.
echo ==================================================
echo.
pause

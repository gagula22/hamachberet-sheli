@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==================================================
echo   Deploy: topics REST get() fallback (ROOT FIX)
echo   + read-only "Cloud Diagnostic" button
echo   firebase-sync v34 . syncdiag v1
echo ==================================================
echo.

if exist ".git\index.lock" (
  echo Removing stale git lock...
  del /f /q ".git\index.lock"
)

echo Staging all changes...
git add -A

echo Committing...
git commit -m "Root fix: REST get() fallback for topics when Firestore Listen channel is blocked (phone stuck on 23); add read-only cloud-diagnostic button"

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
echo   PHONE: clear site data once, reopen the site, log in.
echo   The notebook list should now show ALL 41 (week 24/25, June).
echo   If still 23, tap the purple "Cloud Diagnostic" button
echo   in the sidebar and send me the numbers it shows.
echo ==================================================
echo.
pause

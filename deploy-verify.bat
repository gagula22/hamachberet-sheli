@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==================================================
echo   Deploy: real SERVER-verified cloud check
echo ==================================================
echo.
if exist ".git\index.lock" del /f /q ".git\index.lock"
echo Repairing index state...
git reset
echo Committing...
git add -A
git commit -m "forcesync: real server-side verify (source:server) before/after upload"
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
echo   2) Side menu - green button: "Check + upload to cloud".
echo   3) Click it, send Claude the popup (real server numbers).
echo ==================================================
echo.
pause

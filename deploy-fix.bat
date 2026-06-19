@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==================================================
echo   Deploy: Word-paste font clean + image centering
echo ==================================================
echo.

if exist ".git\index.lock" del /f /q ".git\index.lock"

echo Repairing index state...
git reset

echo Syncing with GitHub first...
git fetch origin
git merge origin/main -m "merge live before fix deploy"
if errorlevel 1 (
  echo Conflict - taking live firebase-sync.js if that is the only one...
  git checkout --theirs js/firebase-sync.js 2>nul
  git add js/firebase-sync.js 2>nul
  git ls-files -u > "%TEMP%\_u.txt"
  for %%A in ("%TEMP%\_u.txt") do set "U=%%~zA"
  if not "%U%"=="0" ( echo Other conflicts remain - copy this window to Claude. & pause & exit /b 1 )
  git commit --no-edit
)

echo Staging + committing...
git add -A
git commit -m "notebook: stop keeping Word font-size on paste; export image inline+centered"

echo Pushing...
git push origin main
if errorlevel 1 ( echo. & echo Push failed - copy this window to Claude. & pause & exit /b 1 )

echo.
echo ==================================================
echo   DONE. Live in ~1-2 min:
echo   https://gagula22.github.io/hamachberet-sheli
echo   Refresh with Ctrl+Shift+R.
echo ==================================================
echo.
pause

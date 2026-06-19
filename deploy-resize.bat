@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==================================================
echo   Deploy: drag-resize image handles (max A4)
echo ==================================================
echo.

if exist ".git\index.lock" del /f /q ".git\index.lock"

echo Repairing index state (rewrite from HEAD)...
git reset

echo Syncing with GitHub first (avoid divergence)...
git fetch origin
git merge origin/main -m "merge live before resize deploy"
if errorlevel 1 (
  echo.
  echo Merge conflict - taking live firebase-sync.js if that is the only one...
  git checkout --theirs js/firebase-sync.js 2>nul
  git add js/firebase-sync.js 2>nul
  git ls-files -u > "%TEMP%\_u.txt"
  for %%A in ("%TEMP%\_u.txt") do set "U=%%~zA"
  if not "%U%"=="0" (
    echo Other conflicts remain - copy this window to Claude. & pause & exit /b 1
  )
  git commit --no-edit
)

echo Staging local changes (resize handles + css + versions)...
git add -A
git commit -m "notebook: drag-resize image handles, hard ceiling A4 (680px)"

echo Pushing...
git push origin main
if errorlevel 1 (
  echo.
  echo Push failed - copy this whole window and send it to Claude.
  pause & exit /b 1
)

echo.
echo ==================================================
echo   DONE. Live in ~1-2 min:
echo   https://gagula22.github.io/hamachberet-sheli
echo   Refresh with Ctrl+Shift+R, then hover an image
echo   and drag a bottom corner to resize (up to A4).
echo ==================================================
echo.
pause

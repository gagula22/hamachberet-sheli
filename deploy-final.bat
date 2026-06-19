@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==================================================
echo   Final deploy: merge live + push (safe)
echo ==================================================
echo.

if exist ".git\index.lock" del /f /q ".git\index.lock"

echo Making sure no merge is half-done...
git merge --abort 2>nul

echo Fetching latest from GitHub...
git fetch origin

echo Merging live version...
git merge origin/main -m "merge live + notebook image A4/quality + PWA"
if not errorlevel 1 goto push

echo.
echo Conflict detected - auto-resolving firebase-sync.js (take live version)...
git checkout --theirs js/firebase-sync.js
git add js/firebase-sync.js
git add -A

REM check if any conflicts still remain
git ls-files -u > "%TEMP%\_unmerged.txt"
for %%A in ("%TEMP%\_unmerged.txt") do set "USZ=%%~zA"
if not "%USZ%"=="0" (
  echo.
  echo **************************************************
  echo  Other conflicts remain ^(probably index.html^).
  echo  Nothing pushed, nothing lost.
  echo  Please screenshot this window + run:  git status
  echo  and send both to Claude to resolve safely.
  echo **************************************************
  echo.
  pause
  exit /b 1
)

echo Completing the merge...
git commit --no-edit

:push
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
echo   DONE. Live in ~1-2 min:
echo   https://gagula22.github.io/hamachberet-sheli
echo   Refresh with Ctrl+Shift+R
echo ==================================================
echo.
pause

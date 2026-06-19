@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==================================================
echo   Recover from stuck rebase + deploy (merge mode)
echo ==================================================
echo.

REM 1) clear stuck lock
if exist ".git\index.lock" del /f /q ".git\index.lock"

REM 2) get OUT of the stuck rebase (safe - nothing is lost)
echo Aborting the stuck rebase...
git rebase --abort 2>nul

REM 3) make sure nothing half-staged remains
git reset 2>nul

REM 4) get the latest from GitHub
echo Fetching latest from GitHub...
git fetch origin

REM 5) MERGE the live version into ours (more forgiving than rebase)
echo Merging live version...
git merge origin/main -m "merge live version + local fixes"
if errorlevel 1 (
  echo.
  echo **************************************************
  echo  MERGE CONFLICT - nothing pushed, nothing lost.
  echo  Please copy / screenshot this whole window and
  echo  send it to Claude to finish the merge safely.
  echo  ^(Do NOT run any other deploy file meanwhile.^)
  echo **************************************************
  echo.
  pause
  exit /b 1
)

REM 6) push the merged result
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

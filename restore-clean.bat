@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==================================================
echo   Restore repo to a clean, intact state
echo   (fixes truncated files, aborts the stuck merge)
echo   NOTHING is pushed. NOTHING is lost.
echo ==================================================
echo.

if exist ".git\index.lock" del /f /q ".git\index.lock"

echo Aborting any in-progress merge / rebase...
git merge --abort 2>nul
git rebase --abort 2>nul

echo Restoring ALL files from git (repairs truncated files)...
git reset --hard HEAD

echo.
echo ---- current commit ----
git log --oneline -3
echo.
echo ---- status ----
git status -sb
echo.
echo ==================================================
echo   Done. Repo is clean and files are intact.
echo   Send Claude a screenshot of this window.
echo ==================================================
echo.
pause

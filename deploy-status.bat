@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Committing status/handoff doc...
if exist ".git\index.lock" del /f /q ".git\index.lock"
git reset
git add -A
git commit -m "docs: session status + handoff (2026-06-20) - cloud verified 41 topics; phone read pending"
git fetch origin
git merge origin/main -m "merge live"
if errorlevel 1 ( echo. & echo Merge conflict. Copy this window to Claude. & pause & exit /b 1 )
git push origin main
echo.
echo DONE. Status doc is in the repo: STATUS-2026-06-20.md
echo.
pause

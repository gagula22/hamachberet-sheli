@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==================================================
echo   Deploy: mobile topics-list cut-off fix
echo   (notebook list was capped at 38vh on phone)
echo   notebook.css v47
echo ==================================================
echo.

if exist ".git\index.lock" (
  echo Removing stale git lock...
  del /f /q ".git\index.lock"
)

echo Staging all changes...
git add -A

echo Committing...
git commit -m "Fix mobile notebook list cut-off: when topics panel is the active mobile panel, use full height + page scroll instead of the 38vh capped strip (was hiding notebooks below a divider line)"

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
echo   PHONE: reload (or clear site data once), open the
echo   notebook list - you should now be able to scroll
echo   through ALL notebooks (no more cut-off line).
echo ==================================================
echo.
pause

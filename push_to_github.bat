@echo off
chcp 65001 > nul
cd /d "%~dp0"

if exist .git\index.lock (
  del /f /q .git\index.lock
  echo Lock file removed.
)

git add -A
git diff --cached --quiet && (echo Nothing to commit. && goto end)
for /f "tokens=*" %%i in ('powershell -command "Get-Date -Format \"yyyy-MM-dd HH:mm\""') do set TIMESTAMP=%%i
git commit -m "Update: %TIMESTAMP%"
git branch -M main
git push -u origin main
:end

echo.
echo Done! Check https://github.com/outinletter/pilotmetrics
pause

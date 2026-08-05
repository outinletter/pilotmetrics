@echo off
chcp 65001 > nul
cd /d "%~dp0"

if exist .git\index.lock (
  del /f /q .git\index.lock
  echo Lock file removed.
)

git add -A
git commit -m "Initial commit: Cloudflare Workers rewrite (Hono + D1)"
git branch -M main
git push -u origin main

echo.
echo Done! Check https://github.com/outinletter/pilotmetrics
pause

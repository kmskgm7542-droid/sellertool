@echo off
chcp 65001 >nul
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
cd /d "%~dp0"
if not exist data mkdir data
echo [%date% %time%] daily_run 시작 >> data\daily.log
python -u yt_posts.py >> data\daily.log 2>&1
python -u tg_collect.py >> data\daily.log 2>&1
python -u yt_live.py >> data\daily.log 2>&1
call :find_node
if exist data\anthropic.json (
  python -u extract_calls.py >> data\daily.log 2>&1
) else (
  if defined NODE "%NODE%" extract_rules.mjs >> data\daily.log 2>&1
)
if defined NODE "%NODE%" live.mjs --once >> data\daily.log 2>&1
python -u export_drive.py >> data\daily.log 2>&1
echo [%date% %time%] daily_run 끝 >> data\daily.log
exit /b 0

:find_node
set "NODE="
where node >nul 2>&1 && set "NODE=node"
if not defined NODE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE if exist "%LocalAppData%\Programs\nodejs\node.exe" set "NODE=%LocalAppData%\Programs\nodejs\node.exe"
exit /b 0

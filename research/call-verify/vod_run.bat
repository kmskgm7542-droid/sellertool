@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist data mkdir data
set "LOG=data\vod.log"
echo [%date% %time%] vod_run 시작 >> "%LOG%"
python -u yt_live.py >> "%LOG%" 2>&1
call :find_node
if exist data\anthropic.json (
  python -u extract_calls.py >> "%LOG%" 2>&1
) else (
  if defined NODE "%NODE%" extract_rules.mjs >> "%LOG%" 2>&1
)
python -u export_drive.py >> "%LOG%" 2>&1
echo [%date% %time%] vod_run 끝 >> "%LOG%"
exit /b 0

:find_node
set "NODE="
where node >nul 2>&1 && set "NODE=node"
if not defined NODE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE if exist "%LocalAppData%\Programs\nodejs\node.exe" set "NODE=%LocalAppData%\Programs\nodejs\node.exe"
exit /b 0

@echo off
chcp 65001 >nul
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
cd /d "%~dp0"
if not exist data mkdir data
set "LOG=data\vod.log"
echo [%date% %time%] vod_run 시작 >> "%LOG%"
python -u yt_live.py >> "%LOG%" 2>&1
call :find_node
rem 김이사 대행 수신함(드라이브 call-verify-inbox) — 받아서 봇 명령과 같은 규칙으로 처리(콜 기록·소급·취소·관심종목·별칭)
python -u drive_inbox.py >> "%LOG%" 2>&1
if defined NODE "%NODE%" inbox.mjs >> "%LOG%" 2>&1
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

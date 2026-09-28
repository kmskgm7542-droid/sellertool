@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist data mkdir data
set "LOG=data\weekly.log"
echo [%date% %time%] weekly_run 시작 >> "%LOG%"

call :find_node
if not defined NODE (
  echo Node.js 가 없습니다 >> "%LOG%"
  python notify.py "⚠ 주간 검증 실패: PC에 Node.js 가 없습니다. schedule_weekly.bat 을 다시 실행해 주세요." >> "%LOG%" 2>&1
  exit /b 1
)

python -u yt_posts.py >> "%LOG%" 2>&1
python -u tg_collect.py >> "%LOG%" 2>&1
"%NODE%" run.mjs parse data\yt_result.json >> "%LOG%" 2>&1
"%NODE%" run.mjs merge >> "%LOG%" 2>&1
"%NODE%" live.mjs --once >> "%LOG%" 2>&1
if exist data\live_calls.json (
  "%NODE%" run.mjs parse data\live_calls.json >> "%LOG%" 2>&1
  "%NODE%" run.mjs merge >> "%LOG%" 2>&1
)
python -u fetch_prices.py >> "%LOG%" 2>&1
"%NODE%" run.mjs sim >> "%LOG%" 2>&1
if exist data\site.json python -u publish.py >> "%LOG%" 2>&1
python -u notify.py >> "%LOG%" 2>&1
if exist data\drive.json python -u export_drive.py >> "%LOG%" 2>&1
echo [%date% %time%] weekly_run 끝 >> "%LOG%"
exit /b 0

:find_node
set "NODE="
where node >nul 2>&1 && set "NODE=node"
if not defined NODE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE if exist "%LocalAppData%\Programs\nodejs\node.exe" set "NODE=%LocalAppData%\Programs\nodejs\node.exe"
exit /b 0

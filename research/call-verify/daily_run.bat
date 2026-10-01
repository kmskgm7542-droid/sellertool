@echo off
chcp 65001 >nul
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
cd /d "%~dp0"
if not exist data mkdir data
set "LOG=data\daily.log"
echo [%date% %time%] daily_run 시작 >> "%LOG%"
call :find_node

rem 1) 수집: 게시판·텔레그램·방송 자막·방송 타점(직접 기록)
python -u yt_posts.py >> "%LOG%" 2>&1
python -u tg_collect.py >> "%LOG%" 2>&1
python -u yt_live.py >> "%LOG%" 2>&1
if exist data\anthropic.json (
  python -u extract_calls.py >> "%LOG%" 2>&1
) else (
  if defined NODE "%NODE%" extract_rules.mjs >> "%LOG%" 2>&1
)
if defined NODE "%NODE%" live.mjs --once >> "%LOG%" 2>&1

rem 2) 검증: 원장 갱신 → 시세 → 시뮬레이션 → 성적표(웹·HTML) — 매일 갱신해 웹에서 일간으로 확인
if not defined NODE (
  echo Node.js 가 없어 검증 단계를 건너뜁니다 >> "%LOG%"
  goto :export
)
"%NODE%" run.mjs parse data\yt_result.json >> "%LOG%" 2>&1
"%NODE%" run.mjs merge >> "%LOG%" 2>&1
if exist data\live_calls.json (
  "%NODE%" run.mjs parse data\live_calls.json >> "%LOG%" 2>&1
  "%NODE%" run.mjs merge >> "%LOG%" 2>&1
)
python -u fetch_prices.py >> "%LOG%" 2>&1
"%NODE%" run.mjs sim >> "%LOG%" 2>&1
"%NODE%" report_html.mjs >> "%LOG%" 2>&1
if exist data\site.json python -u publish.py >> "%LOG%" 2>&1
if exist data\tg_bot.json python -u notify.py --daily >> "%LOG%" 2>&1

:export
python -u export_drive.py >> "%LOG%" 2>&1
echo [%date% %time%] daily_run 끝 >> "%LOG%"
exit /b 0

:find_node
set "NODE="
where node >nul 2>&1 && set "NODE=node"
if not defined NODE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE if exist "%LocalAppData%\Programs\nodejs\node.exe" set "NODE=%LocalAppData%\Programs\nodejs\node.exe"
exit /b 0

@echo off
if "%~1"=="" ( cmd /k ""%~f0" run" & exit /b )
chcp 65001 >nul
cd /d "%~dp0"
echo === 방송 다시보기 자막 수집 + 타점 자동추출 - 지금 한 번 실행 ===
echo 진행 내용은 data\yt_live_run.log 에도 남습니다.
echo.
python -m pip install -q --disable-pip-version-check playwright
python -m playwright install chromium >nul 2>&1
python -u yt_live.py
call :find_node
if exist data\anthropic.json (
  python -m pip install -q --disable-pip-version-check anthropic
  python -u extract_calls.py
) else (
  if defined NODE "%NODE%" extract_rules.mjs
  if not defined NODE echo Node.js 가 없습니다. schedule_weekly.bat 을 먼저 실행하세요.
)
if exist data\drive.json python -u export_drive.py
echo.
echo 끝났습니다.
exit /b 0

:find_node
set "NODE="
where node >nul 2>&1 && set "NODE=node"
if not defined NODE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE if exist "%LocalAppData%\Programs\nodejs\node.exe" set "NODE=%LocalAppData%\Programs\nodejs\node.exe"
exit /b 0

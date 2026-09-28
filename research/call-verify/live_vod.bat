@echo off
if "%~1"=="" ( cmd /k ""%~f0" run" & exit /b )
chcp 65001 >nul
cd /d "%~dp0"
echo === 방송 다시보기 자막 수집 + 타점 자동추출 - 지금 한 번 실행 ===
echo 진행 내용은 data\yt_live_run.log, data\extract_run.log 에도 남습니다.
echo.
python -m pip install -q --disable-pip-version-check playwright anthropic
python -m playwright install chromium >nul 2>&1
python -u yt_live.py
python -u extract_calls.py
echo.
echo 끝났습니다.

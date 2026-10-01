@echo off
if "%~1"=="" ( cmd /k ""%~f0" run" & exit /b )
chcp 65001 >nul
cd /d "%~dp0"
echo === 방송 자막 자동추출용 Claude API 키 연결 ===
python -m pip install -q --disable-pip-version-check anthropic
python setup_ai.py
echo.
echo 끝났습니다.

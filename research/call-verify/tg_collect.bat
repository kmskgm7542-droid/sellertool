@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === 텔레그램 콜 수집기 ===
where python >nul 2>&1
if errorlevel 1 (
  echo Python 이 없습니다. https://www.python.org/downloads/ 에서 설치 후 다시 실행하세요.
  echo 설치 시 "Add python.exe to PATH" 체크 필수.
  pause
  exit /b 1
)
python -m pip install -q --disable-pip-version-check telethon
python tg_collect.py
echo.
pause

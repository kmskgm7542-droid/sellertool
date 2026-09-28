@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === 텔레그램 콜 수집기 ===
echo.
where python >nul 2>&1
if errorlevel 1 (
  echo [1/2] Python 이 아직 없습니다. 지금 다운로드 페이지를 엽니다.
  echo       설치 화면 맨 아래 "Add python.exe to PATH" 에 체크한 뒤 Install Now 를 누르세요.
  echo       설치가 끝나면 이 파일(tg_collect.bat)을 다시 더블클릭하세요.
  start https://www.python.org/downloads/
  pause
  exit /b 1
)
echo [1/2] 준비 중... (처음 한 번은 1분쯤 걸립니다)
python -m pip install -q --disable-pip-version-check --upgrade pip telethon >nul 2>&1
echo [2/2] 시작
echo.
python tg_collect.py
echo.
echo 창을 닫으셔도 됩니다.
pause

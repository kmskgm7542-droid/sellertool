@echo off
if "%~1"=="" ( cmd /k ""%~f0" run" & exit /b )
chcp 65001 >nul
cd /d "%~dp0"
if not exist data mkdir data
echo === 텔레그램 콜 수집기 ===
echo (진행 내용은 data\tg_run.log 에도 저장됩니다. 창이 닫히면 그 파일을 올려주세요)
echo.
where python >nul 2>&1
if errorlevel 1 (
  echo Python 이 없습니다. 지금 다운로드 페이지를 엽니다. "Add python.exe to PATH" 체크 후 Install Now.
  start https://www.python.org/downloads/
  goto :end
)
python --version 2>&1 | findstr /i "Python 3" >nul || (
  echo Python 이 제대로 설치되지 않았습니다. 아래 내용을 캡처해 주세요.
  python --version
  goto :end
)
echo [1/2] 준비 중... (처음 한 번은 1분쯤 걸립니다)
python -m pip install -q --disable-pip-version-check --upgrade pip telethon
echo [2/2] 시작
echo.
python -u tg_collect.py
echo.
:end
echo ---------------------------------------------
echo 끝났습니다. 이 창을 캡처하거나 data\tg_run.log 를 올려주세요.

@echo off
if "%~1"=="" ( cmd /k ""%~f0" run" & exit /b )
chcp 65001 >nul
cd /d "%~dp0"
if not exist data mkdir data
echo === 유튜브 게시판 수집기 ===
echo (진행 내용은 data\yt_run.log 에도 저장됩니다. 창이 닫히면 그 파일을 올려주세요)
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
echo [1/3] 준비 중... (처음 한 번은 브라우저 다운로드로 2~3분 걸립니다)
python -m pip install -q --disable-pip-version-check --upgrade pip playwright
python -m playwright install chromium
echo [2/3] 브라우저를 엽니다. 브라우저 창은 닫지 마세요.
echo [3/3] 시작
echo.
python -u yt_posts.py
echo.
:end
echo ---------------------------------------------
echo 끝났습니다. 이 창을 캡처하거나 data\yt_run.log 를 올려주세요.

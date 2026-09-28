@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === 유튜브 게시판 수집기 ===
echo.
where python >nul 2>&1
if errorlevel 1 (
  echo Python 이 아직 없습니다. 지금 다운로드 페이지를 엽니다.
  echo "Add python.exe to PATH" 체크 후 Install Now, 끝나면 이 파일을 다시 더블클릭하세요.
  start https://www.python.org/downloads/
  pause
  exit /b 1
)
echo [1/3] 준비 중... (처음 한 번은 브라우저 다운로드로 2~3분 걸립니다)
python -m pip install -q --disable-pip-version-check --upgrade pip playwright >nul 2>&1
python -m playwright install chromium >nul 2>&1
echo [2/3] 브라우저를 엽니다. 첫 실행이면 유튜브 로그인 후 이 창에서 Enter.
echo [3/3] 시작
echo.
python yt_posts.py
echo.
echo 창을 닫으셔도 됩니다.
pause

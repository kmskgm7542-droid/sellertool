@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
rem data 폴더(자막·시세·로그·브라우저 로그인 프로필·토큰)를 D 드라이브로 옮기고, 원래 자리에는 연결(정션)만 남긴다.
rem 코드는 그대로 data\ 를 쓰므로 바꿀 것이 없다. 실행: move_data_to_d.bat  (다른 위치: move_data_to_d.bat E:\call-verify-data)
rem 정리(며칠 정상 확인 후 옛 복사본 삭제): move_data_to_d.bat 정리
rem 되돌리기: rmdir data  →  ren data_old_backup data   (rmdir 은 연결만 지우고 D 의 파일은 남는다)

set "T=%~1"
if /i "%T%"=="정리" goto :cleanup
if "%T%"=="" set "T=D:\call-verify-data"

fsutil reparsepoint query data >nul 2>&1
if not errorlevel 1 (
  echo 이미 data 가 다른 위치로 연결되어 있습니다:
  dir /al | findstr /i "data"
  goto :end
)
if not exist data (
  echo data 폴더가 없습니다. call-verify 폴더 안에서 실행하세요.
  goto :end
)
if not exist "%T:~0,3%" (
  echo %T:~0,2% 드라이브가 없습니다.
  goto :end
)
if exist data_old_backup (
  echo data_old_backup 이 이미 있습니다. 먼저 확인 후 지워 주세요.
  goto :end
)

echo.
echo  data 폴더를 "%T%" 로 옮깁니다.
echo  ※ 자동 실행 시간(평일 14:40~16:50 봇 대기, 18:30·21:30 매일 실행)을 피해서 하세요.
echo  ※ 실행 중인 봇 창(live_run)이 있으면 먼저 닫으세요.
echo.
tasklist | findstr /i "node.exe python.exe chrome.exe" >nul && (
  echo  ⚠ node / python / chrome 이 실행 중입니다. 자동 실행 중이면 끝난 뒤에 하세요.
)
pause

echo [1/4] 복사 중...
robocopy data "%T%" /E /COPY:DAT /DCOPY:T /R:1 /W:1 /NFL /NDL /NP
if errorlevel 8 (
  echo ✖ 복사 실패(robocopy 오류). 원래 data 는 그대로입니다.
  goto :end
)

echo [2/4] 파일 수 확인...
for /f %%a in ('powershell -NoProfile -Command "(Get-ChildItem -LiteralPath 'data' -Recurse -File -Force | Measure-Object).Count"') do set SRC=%%a
for /f %%a in ('powershell -NoProfile -Command "(Get-ChildItem -LiteralPath '%T%' -Recurse -File -Force | Measure-Object).Count"') do set DST=%%a
echo   원래 %SRC%개 / D 드라이브 %DST%개
if not "%SRC%"=="%DST%" (
  echo ✖ 파일 수가 다릅니다. 원래 data 는 그대로 두고 멈춥니다. 이 창을 캡처해 주세요.
  goto :end
)

echo [3/4] 연결 만들기...
ren data data_old_backup || (echo ✖ data 이름을 바꾸지 못했습니다(사용 중). 프로그램을 닫고 다시 실행하세요. & goto :end)
mklink /J data "%T%"
if errorlevel 1 (
  echo ✖ 연결 실패 — 원래대로 되돌립니다.
  ren data_old_backup data
  goto :end
)

echo [4/4] 확인...
if not exist data\ledger.csv if not exist data\live_calls.json (
  echo ✖ 연결된 data 에서 파일이 안 보입니다 — 원래대로 되돌립니다.
  rmdir data
  ren data_old_backup data
  goto :end
)
echo.
echo ✅ 완료: data → %T%
echo    옛 복사본 data_old_backup 은 C 드라이브에 남아 있습니다.
echo    오늘 저녁 18:30·21:30 실행이 정상인지 보고 나서 "move_data_to_d.bat 정리" 로 지우세요.
goto :end

:cleanup
fsutil reparsepoint query data >nul 2>&1
if errorlevel 1 (
  echo data 가 아직 D 드라이브로 연결되어 있지 않습니다. 정리하지 않습니다.
  goto :end
)
if not exist data_old_backup (
  echo 지울 data_old_backup 이 없습니다.
  goto :end
)
echo C 드라이브의 옛 복사본 data_old_backup 을 지웁니다(D 드라이브의 data 는 그대로).
pause
rmdir /s /q data_old_backup
echo ✅ 정리 완료

:end
echo.
pause
endlocal

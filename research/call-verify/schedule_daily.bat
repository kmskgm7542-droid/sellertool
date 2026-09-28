@echo off
if "%~1"=="" ( cmd /k ""%~f0" run" & exit /b )
chcp 65001 >nul
cd /d "%~dp0"
echo === 매일 자동 수집 등록 (윈도우 작업 스케줄러) ===
echo 매일 밤 9시 30분에 유튜브 게시판 + 텔레그램을 자동으로 수집합니다. (PC가 켜져 있고 로그인돼 있을 때)
echo.
set "RUN=%~dp0daily_run.bat"
schtasks /create /f /tn "CallVerifyDaily" /tr "\"%RUN%\"" /sc daily /st 21:30 /it
if errorlevel 1 (
  echo 등록 실패. 이 창을 캡처해 주세요.
) else (
  echo 등록 완료. 해제하려면: schtasks /delete /tn CallVerifyDaily /f
  echo 지금 바로 한 번 시험 실행합니다...
  call "%RUN%"
)
echo.
echo 끝났습니다.

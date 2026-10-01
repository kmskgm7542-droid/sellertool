@echo off
if "%~1"=="" ( cmd /k ""%~f0" run" & exit /b )
chcp 65001 >nul
cd /d "%~dp0"
echo === 매일 자동 수집 등록 - 윈도우 작업 스케줄러 ===
echo 1) 매일 21:30 유튜브 게시판 + 텔레그램 + 방송 자막 수집·추출
echo 2) 평일 18:30 방송 다시보기 자막만 한 번 더 - 방송 끝난 뒤 빨리 받기 위해
echo PC가 켜져 있고 로그인돼 있을 때 실행됩니다.
echo.
set "RUN=%~dp0daily_run.bat"
schtasks /create /f /tn "CallVerifyDaily" /tr "\"%RUN%\"" /sc daily /st 21:30 /it
if errorlevel 1 (
  echo 등록 실패. 이 창을 캡처해 주세요.
  goto :end
)
set "VOD=%~dp0vod_run.bat"
schtasks /create /f /tn "CallVerifyVod" /tr "\"%VOD%\"" /sc weekly /d MON,TUE,WED,THU,FRI /st 18:30 /it
if errorlevel 1 (
  echo 18:30 작업 등록 실패. 이 창을 캡처해 주세요.
  goto :end
)
echo 등록 완료. 해제: schtasks /delete /tn CallVerifyDaily /f  및  schtasks /delete /tn CallVerifyVod /f
echo 지금 바로 한 번 시험 실행합니다...
call "%RUN%"
:end
echo.
echo 끝났습니다.

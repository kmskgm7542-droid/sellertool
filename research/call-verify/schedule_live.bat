@echo off
if "%~1"=="" ( cmd /k ""%~f0" run" & exit /b )
chcp 65001 >nul
cd /d "%~dp0"
echo === 방송 타점 기록 대기 등록 - 평일 14:40 부터 130분 ===
echo 방송 중 텔레그램 봇에 "종목 진입가 매수 손절 N 목표 N 기간" 을 보내면 바로 답장이 옵니다.
echo.
if not exist data\tg_bot.json (
  echo [준비] 텔레그램 봇이 아직 연결되지 않았습니다. setup_bot.bat 을 먼저 실행하세요.
  goto :end
)
set "RUN=%~dp0live_run.bat"
schtasks /create /f /tn "CallVerifyLive" /tr "\"%RUN%\" 130" /sc weekly /d MON,TUE,WED,THU,FRI /st 14:40 /it
if errorlevel 1 (
  echo 등록 실패. 이 창을 캡처해 주세요.
  goto :end
)
echo 등록 완료. 해제: schtasks /delete /tn CallVerifyLive /f
echo.
echo 지금 5분 동안 시험 대기합니다. 텔레그램 봇에 아래처럼 보내 보세요.
echo   테스트종목 1000 매수 손절 900 목표 1200 2주
echo 답장이 오면 "취소" 를 보내 지우세요.
call "%RUN%" 5
echo 시험 끝. 답장이 안 왔으면 data\live.log 를 올려주세요.
:end
echo.
echo 끝났습니다.

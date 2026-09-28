@echo off
if "%~1"=="" ( cmd /k ""%~f0" run" & exit /b )
chcp 65001 >nul
cd /d "%~dp0"
echo === 주간 자동 검증 등록 (매주 일요일 밤 10시) ===
echo 매주: 수집 → 콜 파싱 → 시세 → 시뮬레이션 → 텔레그램 성적표 전송, 전부 자동.
echo.

where node >nul 2>&1
if errorlevel 1 if not exist "%ProgramFiles%\nodejs\node.exe" (
  echo [준비] Node.js 를 설치합니다. 1~2분 걸립니다...
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  if errorlevel 1 (
    echo winget 설치가 안 되면 https://nodejs.org 에서 LTS 를 직접 설치한 뒤 이 파일을 다시 실행하세요.
    start https://nodejs.org/
    goto :end
  )
)

if not exist data\tg_bot.json (
  echo [준비] 텔레그램 봇이 아직 연결되지 않았습니다. 먼저 봇을 연결합니다.
  python setup_bot.py
  if errorlevel 1 goto :end
)

set "RUN=%~dp0weekly_run.bat"
schtasks /create /f /tn "CallVerifyWeekly" /tr "\"%RUN%\"" /sc weekly /d SUN /st 22:00 /it
if errorlevel 1 (
  echo 등록 실패. 이 창을 캡처해 주세요.
  goto :end
)
echo 등록 완료. 해제: schtasks /delete /tn CallVerifyWeekly /f
echo.
echo 지금 바로 한 번 시험 실행합니다. 2~5분 뒤 텔레그램으로 성적표가 옵니다...
call "%RUN%"
echo 시험 실행 끝. 텔레그램을 확인하세요. 안 왔으면 data\weekly.log 를 올려주세요.
:end
echo.
echo 끝났습니다.

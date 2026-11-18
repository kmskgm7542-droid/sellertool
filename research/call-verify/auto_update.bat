@echo off
rem 매일 18:10 자동 업데이트(예약작업 CallVerifyUpdate) — 안전 업데이트 도구를 창 입력 없이 실행하고 결과를 data\update.log 에 남긴다.
rem 도구가 없거나 실패하면 건강검진이 경보로 알린다. 실행 중인 작업이 있으면 도구가 스스로 중단한다.
chcp 65001 >nul
cd /d "%~dp0"
if not exist data mkdir data
set "U=D:\Projects\_tools\call_verify_update.bat"
echo [%date% %time%] 자동 업데이트 시작 >> data\update.log
if not exist "%U%" (
  echo [%date% %time%] 실패: %U% 없음 >> data\update.log
  exit /b 1
)
cmd /c call "%U%" < nul >> data\update.log 2>&1
echo [%date% %time%] 자동 업데이트 끝 (종료코드 %errorlevel%) >> data\update.log
exit /b 0

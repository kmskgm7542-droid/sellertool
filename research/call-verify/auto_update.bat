@echo off
rem 매일 18:10 자동 업데이트(예약작업 CallVerifyUpdate) — 안전 업데이트 도구를 창 입력 없이 실행한다.
rem 도구는 자기 기록을 data\update.log 에 직접 쓴다 → 여기서는 같은 파일을 열지 않고 data\auto_update.log 에 따로 남긴다(같은 파일을 둘이 쓰면 잠김 오류로 업데이트가 실패한다).
chcp 65001 >nul
cd /d "%~dp0"
if not exist data mkdir data
set "U=D:\Projects\_tools\call_verify_update.bat"
echo [%date% %time%] 자동 업데이트 시작 >> data\auto_update.log
if not exist "%U%" (
  echo [%date% %time%] 실패: %U% 없음 >> data\auto_update.log
  exit /b 1
)
cmd /c call "%U%" < nul >> data\auto_update.log 2>&1
echo [%date% %time%] 자동 업데이트 끝 (종료코드 %errorlevel%) >> data\auto_update.log
exit /b 0

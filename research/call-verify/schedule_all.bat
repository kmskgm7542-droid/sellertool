@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === 콜 검증 예약작업 한 번에 등록 ===
echo 놓친 실행은 PC 가 켜질 때 자동 보충, 매일 18:10 자동 업데이트, 매일 밤 실행 결과 텔레그램 알림
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0schedule_all.ps1"
echo.
pause

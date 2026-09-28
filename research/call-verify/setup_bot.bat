@echo off
if "%~1"=="" ( cmd /k ""%~f0" run" & exit /b )
chcp 65001 >nul
cd /d "%~dp0"
echo === 텔레그램 봇 연결 (주간 성적표 받을 곳) ===
python setup_bot.py
echo.
echo 끝났습니다.

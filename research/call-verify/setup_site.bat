@echo off
if "%~1"=="" ( cmd /k ""%~f0" run" & exit /b )
chcp 65001 >nul
cd /d "%~dp0"
echo === 성적표 웹페이지 연결 ===
python setup_site.py
echo.
echo 끝났습니다.

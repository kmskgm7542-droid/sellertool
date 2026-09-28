@echo off
if "%~1"=="" ( cmd /k ""%~f0" run" & exit /b )
chcp 65001 >nul
cd /d "%~dp0"
echo === 검토용 파일을 지금 드라이브로 올리기 ===
python -m pip install -q --disable-pip-version-check playwright
python -u export_drive.py
echo.
echo 끝났습니다.

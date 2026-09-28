@echo off
if "%~1"=="" ( cmd /k ""%~f0" run" & exit /b )
chcp 65001 >nul
cd /d "%~dp0"
echo === 사생팬알림방 사진 모으기 ===
python pick_media.py
echo.
echo 끝났습니다. data\사생팬사진.zip 을 올려주세요.

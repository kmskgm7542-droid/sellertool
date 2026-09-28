@echo off
if "%~1"=="" ( cmd /k ""%~f0" run" & exit /b )
chcp 65001 >nul
cd /d "%~dp0"
echo === 정보 알림 채널 사진 모으기 (최근 60일) ===
python pick_media.py "정보" 60 "공개채널사진.zip"
echo.
echo 끝났습니다. data\공개채널사진.zip 을 올려주세요.

@echo off
if "%~1"=="" ( cmd /k ""%~f0" run" & exit /b )
chcp 65001 >nul
cd /d "%~dp0"
echo === 구글 드라이브 자동 검토 연결 ===
echo 검토용 파일만 드라이브 폴더 call-verify-sync 로 복사합니다. 토큰이나 비밀번호 파일은 복사하지 않습니다.
echo.
python setup_drive.py
echo.
echo 끝났습니다.

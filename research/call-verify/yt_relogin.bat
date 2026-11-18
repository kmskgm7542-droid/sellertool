@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === 유튜브·구글 다시 로그인 ===
echo 게시판 수집·방송 자막·드라이브 업로드가 함께 쓰는 로그인입니다.
echo ※ 자동 실행 시간(평일 14:40~16:50, 매일 18:30·21:30, 일 22:00)은 피해서 실행하세요.
echo.
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
python -u yt_relogin.py
echo.
pause

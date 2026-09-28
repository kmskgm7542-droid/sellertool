@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist data mkdir data
echo [%date% %time%] daily_run 시작 >> data\daily.log
python -u yt_posts.py >> data\daily.log 2>&1
python -u tg_collect.py >> data\daily.log 2>&1
echo [%date% %time%] daily_run 끝 >> data\daily.log

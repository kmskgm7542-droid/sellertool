@echo off
rem 관심종목 가격 확인(예약작업 CallVerifyWatch, 10분마다 · watch_hidden.vbs 로 창 없이 실행)
rem 기록은 watch.mjs 가 data\watch.log 에 직접 남긴다(최근 400줄). 이 창의 출력은 data\watch_last.log 에 마지막 1회분만.
chcp 65001 >nul
cd /d "%~dp0"
if not exist data mkdir data
call :find_node
if not defined NODE exit /b 1
"%NODE%" watch.mjs > data\watch_last.log 2>&1
exit /b 0

:find_node
set "NODE="
where node >nul 2>&1 && set "NODE=node"
if not defined NODE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE if exist "%LocalAppData%\Programs\nodejs\node.exe" set "NODE=%LocalAppData%\Programs\nodejs\node.exe"
exit /b 0

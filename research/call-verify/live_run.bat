@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist data mkdir data
set "LOG=data\live.log"
echo [%date% %time%] live_run 시작 >> "%LOG%"
call :find_node
if not defined NODE (
  echo Node.js 가 없습니다 >> "%LOG%"
  exit /b 1
)
"%NODE%" live.mjs --minutes %~1 >> "%LOG%" 2>&1
echo [%date% %time%] live_run 끝 >> "%LOG%"
exit /b 0

:find_node
set "NODE="
where node >nul 2>&1 && set "NODE=node"
if not defined NODE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE if exist "%LocalAppData%\Programs\nodejs\node.exe" set "NODE=%LocalAppData%\Programs\nodejs\node.exe"
exit /b 0

@echo off
if "%~1"=="" ( cmd /k ""%~f0" run" & exit /b )
chcp 65001 >nul
cd /d "%~dp0"
echo === 종목 목록 내려받기 (업비트 + 한국거래소) ===
python markets.py
echo.
echo 끝났습니다. data\upbit_markets.json, data\krx_list.json 을 올려주세요.

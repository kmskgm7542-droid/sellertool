@echo off
if "%~1"=="" ( cmd /k ""%~f0" run" & exit /b )
chcp 65001 >nul
cd /d "%~dp0"
echo === 시세 내려받기 (data\ledger.csv 기준) ===
if not exist data\ledger.csv (
  echo data\ledger.csv 가 없습니다. 김이사가 보낸 ledger.csv 를 data 폴더에 넣은 뒤 다시 실행하세요.
  goto :end
)
python fetch_prices.py
:end
echo.
echo 끝났습니다. data\prices.zip 을 올려주세요.

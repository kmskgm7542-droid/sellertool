"""시세 내려받기 (대표 PC용, fetch.mjs 와 같은 규칙) — data/ledger.csv 의 종목·기간에 맞춰
업비트 1시간봉(코인)·네이버 일봉(국내주식)을 data/prices/*.json 으로 저장하고 data/prices.zip 으로 묶는다.
  실행: fetch_prices.bat
"""
import csv
import json
import re
import time
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path

DATA = Path(__file__).resolve().parent / "data"
PRICES = DATA / "prices"
DAY = 86400
ENTRY_WINDOW_DAYS = 5  # config.mjs RULES.entryWindowDays 와 동일


def get(url, as_json=True):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "accept": "application/json" if as_json else "*/*"})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                body = r.read()
            return json.loads(body) if as_json else body.decode("utf-8", "ignore")
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(1 + attempt)
                continue
            raise
    raise RuntimeError("요청 한도 초과: " + url)


def iso(sec):
    return datetime.fromtimestamp(sec, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def upbit_hourly(market, from_sec, to_sec):
    by_t = {}
    to = iso(to_sec)
    for _ in range(1000):
        url = f"https://api.upbit.com/v1/candles/minutes/60?market={market}&count=200&to={urllib.parse.quote(to)}"
        rows = get(url)
        if not rows:
            break
        for c in rows:
            t = int(datetime.strptime(c["candle_date_time_utc"], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc).timestamp())
            by_t[t] = [t, c["opening_price"], c["high_price"], c["low_price"], c["trade_price"]]
        oldest = int(datetime.strptime(rows[-1]["candle_date_time_utc"], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc).timestamp())
        if oldest <= from_sec:
            break
        to = iso(oldest)
        time.sleep(0.12)
    return [by_t[k] for k in sorted(by_t)]


def naver_daily(code, count):
    txt = get(f"https://fchart.stock.naver.com/sise.nhn?symbol={code}&timeframe=day&count={count}&requestType=0", as_json=False)
    rows = []
    for m in re.finditer(r'data="(\d{8})\|([\d.]+)\|([\d.]+)\|([\d.]+)\|([\d.]+)\|', txt):
        d = m.group(1)
        t = int(datetime(int(d[:4]), int(d[4:6]), int(d[6:8]), tzinfo=timezone.utc).timestamp()) - 9 * 3600
        rows.append([t, float(m.group(2)), float(m.group(3)), float(m.group(4)), float(m.group(5))])
    return sorted(rows)


def main():
    PRICES.mkdir(parents=True, exist_ok=True)
    with open(DATA / "ledger.csv", encoding="utf-8-sig") as f:
        calls = [r for r in csv.DictReader(f) if r.get("ok") == "1" and r.get("market") and r.get("symbol")]
    groups = {}
    for c in calls:
        key = (c["market"], c["symbol"])
        t = int(float(c["t_post_unix"]))
        span = (ENTRY_WINDOW_DAYS + int(float(c["horizon_days"] or 14)) + 3) * DAY
        g = groups.setdefault(key, {"from": t - 3 * DAY, "to": t + span})
        g["from"] = min(g["from"], t - 3 * DAY)
        g["to"] = max(g["to"], t + span)
    now = int(time.time())
    for (market, symbol), g in groups.items():
        try:
            if market == "UPBIT":
                bars = upbit_hourly(symbol, g["from"], min(g["to"], now))
            elif market == "KRX":
                bars = naver_daily(symbol, int((now - g["from"]) / DAY) + 30)
            else:
                continue
            (PRICES / f"{market}_{symbol}.json").write_text(json.dumps(bars), "utf-8")
            print(f"{market} {symbol}: {len(bars)}봉")
        except Exception as exc:
            print(f"{market} {symbol}: 실패 — {exc}")
    out = DATA / "prices.zip"
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for f in PRICES.glob("*.json"):
            z.write(f, f.name)
    print(f"\n시세 {len(list(PRICES.glob('*.json')))}종목 → {out}")
    print("이 prices.zip 을 김이사에게 올려주세요.")


if __name__ == "__main__":
    main()

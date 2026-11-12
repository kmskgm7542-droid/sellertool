"""두 패턴 코인 백테스트 (업비트 원화마켓 일봉, 본인 검증용) — 주식판 bt_patterns2.py 와 같은 조건·같은 평가.

  패턴1 200·400일선 동시 돌파 / 패턴2 N자 눌림목 재상승 (숫자 기준 동일)
  국면 필터: 비트코인 종가 > 비트코인 20일선 일 때만 진입 (주식의 지수 필터 대응)
  손절: 패턴1 종가 < 200일선, 패턴2 종가 < 눌림 저점 → 그날 종가 청산
  기간: 최근 365일(코인은 매일 거래), 앞/뒤 반으로 나눠 확인. 왕복 비용 0.25%(업비트 수수료 0.05%×2 + 슬리피지).
  ※ 업비트 일봉은 KST 09:00 마감 기준. 상장 400일 미만 코인은 200·400일선이 없어 패턴1 대상에서 빠진다.

  실행: python bt_coin.py   (시세는 data/bt_cache_coin/ 에 저장, 레포에 올라가지 않음)
"""
import json
import sys
import time
import urllib.parse
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_prices import get  # noqa: E402
from bt_patterns2 import evaluate  # noqa: E402

DATA = Path(__file__).resolve().parent / "data"
CACHE = DATA / "bt_cache_coin"
STABLE = {"KRW-USDT", "KRW-USDC", "KRW-USDS", "KRW-USD1"}


def upbit_daily(market, bars=820):
    f = CACHE / f"{market}.json"
    if f.exists():
        return json.loads(f.read_text())
    by_d, to = {}, None
    while len(by_d) < bars:
        url = f"https://api.upbit.com/v1/candles/days?market={market}&count=200" + (f"&to={urllib.parse.quote(to)}" if to else "")
        rows = get(url)
        if not rows:
            break
        for c in rows:
            d = c["candle_date_time_kst"][:10].replace("-", "")
            by_d[d] = [d, c["opening_price"], c["high_price"], c["low_price"], c["trade_price"], c["candle_acc_trade_volume"]]
        if len(rows) < 200:
            break
        oldest = rows[-1]["candle_date_time_utc"]
        to = (datetime.strptime(oldest, "%Y-%m-%dT%H:%M:%S")).strftime("%Y-%m-%d %H:%M:%S")
        time.sleep(0.12)
    out = [by_d[k] for k in sorted(by_d)]
    f.write_text(json.dumps(out))
    return out


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    markets = [m["market"] for m in get("https://api.upbit.com/v1/market/all?isDetails=false")
               if m["market"].startswith("KRW-") and m["market"] not in STABLE]
    print(f"업비트 원화마켓 {len(markets)}개 시세 준비")
    data = []
    for k, mk in enumerate(markets):
        try:
            rows = upbit_daily(mk)
        except Exception as e:
            print(f"  {mk} 실패: {e}")
            continue
        if len(rows) > 60:
            data.append((mk, mk, "BTC", rows))
        time.sleep(0.12)
    btc = next(rows for name, _, _, rows in data if name == "KRW-BTC")
    reg, closes = {}, []
    for r in btc:
        closes.append(r[4])
        if len(closes) >= 20:
            reg[r[0]] = r[4] > sum(closes[-20:]) / 20
    n400 = sum(len(rows) > 400 + 20 for *_, rows in data)
    print(f"시세 확보 {len(data)}개 (200·400일선 계산 가능한 코인 {n400}개)")
    evaluate(data, {"BTC": reg}, 365, "BTC")


if __name__ == "__main__":
    main()

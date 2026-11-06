"""두 패턴 코인 1시간봉 백테스트 (업비트 원화마켓, 본인 검증용) — 일봉판 bt_coin.py 와 같은 조건을 '봉' 단위로.

  패턴1: 200·400봉(=시간) 이동평균 동시 돌파 + 윗꼬리 ≤20% + 종가 ≥ 고가×0.98
  패턴2: N자 — 10봉(시간) 안 15%+ 상승 → 23.6~61.8% 되돌림 → 재상승 양봉
  국면 필터: 비트코인 종가 > 비트코인 20봉 이동평균
  손절: 패턴1 종가 < 200봉선, 패턴2 종가 < 눌림 저점 → 그 봉 종가 청산
  보유: 5·10·20봉(시간), 왕복 비용 0.25%. 기간 최근 1년(8,760봉), 앞/뒤 반으로 나눠 확인.

  실행: python bt_coin_1h.py   (시세는 data/bt_cache_coin_1h/ 에 저장, 레포에 올라가지 않음)
"""
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_prices import get, upbit_hourly  # noqa: E402
from bt_coin import STABLE  # noqa: E402
from bt_patterns2 import evaluate  # noqa: E402

DATA = Path(__file__).resolve().parent / "data"
CACHE = DATA / "bt_cache_coin_1h"
TEST_BARS = 8760
NEED_BARS = TEST_BARS + 420
KST = timezone(timedelta(hours=9))


def hourly_rows(market):
    f = CACHE / f"{market}.json"
    if f.exists():
        return json.loads(f.read_text())
    now = int(time.time())
    raw = upbit_hourly(market, now - NEED_BARS * 3600, now)
    rows = [[datetime.fromtimestamp(t, KST).strftime("%Y%m%d%H"), o, h, l, c, 0.0] for t, o, h, l, c in raw]
    f.write_text(json.dumps(rows))
    return rows


def fetch(mk):
    try:
        return mk, hourly_rows(mk)
    except Exception as e:
        print(f"  {mk} 실패: {e}")
        return mk, None


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    markets = [m["market"] for m in get("https://api.upbit.com/v1/market/all?isDetails=false")
               if m["market"].startswith("KRW-") and m["market"] not in STABLE]
    print(f"업비트 원화마켓 {len(markets)}개 1시간봉 준비 (코인당 최대 {NEED_BARS}봉)")
    data, done = [], 0
    with ThreadPoolExecutor(max_workers=6) as ex:  # 업비트 시세 요청 한도(초당 10회) 근처 — 429 는 get() 이 재시도
        for mk, rows in ex.map(fetch, markets):
            done += 1
            if done % 25 == 0:
                print(f"  {done}/{len(markets)}")
            if rows and len(rows) > 60:
                data.append((mk, mk, "BTC", rows))
    btc = next(rows for name, _, _, rows in data if name == "KRW-BTC")
    reg, closes = {}, []
    for r in btc:
        closes.append(r[4])
        if len(closes) >= 20:
            reg[r[0]] = r[4] > sum(closes[-20:]) / 20
    print(f"시세 확보 {len(data)}개 (400봉선 계산 가능 {sum(len(r) > 420 for *_, r in data)}개)")
    print("※ 아래 표의 '일'은 1시간봉 기준 '봉(시간)'으로 읽는다.")
    evaluate(data, {"BTC": reg}, TEST_BARS, "BTC")


if __name__ == "__main__":
    main()

"""일봉 200·400일선 동시 돌파 종목 찾기 (대표 PC용, 본인 확인용 — 매수 추천 아님)

조건 (오늘 봉, 장중에 돌리면 그 시점 가격 기준 — 장 마감 10분 전 확인용):
  1) 동시 돌파: 어제 종가 < max(200일선, 400일선) 이고 오늘 종가 > max(200일선, 400일선)
  2) 양봉 + 짧은 윗꼬리: (고가 - 종가) <= (고가 - 저가) * WICK  (기본 0.2)
  3) 고가 부근 종가: 종가 >= 고가 * NEAR  (기본 0.98)
추가로 최근 N거래일(기본 5) 안에 같은 조건이 떴던 종목은 그 뒤 종가가 200일선 위에서 버티는지 함께 보여준다.

  실행: screen_breakout.bat   결과: 화면 + data/screen_YYYYMMDD-HHMM.csv (data/ 는 레포에 올라가지 않음)
  옵션: python screen_breakout.py --wick 0.2 --near 0.98 --days 5
"""
import argparse
import csv
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_prices import get  # noqa: E402

DATA = Path(__file__).resolve().parent / "data"
KST = timezone(timedelta(hours=9))


def krx_list():
    """코스피·코스닥 전체 {종목명: 코드} — 네이버 시가총액 목록(markets.py 와 같은 방식)."""
    out = {}
    for market in ("KOSPI", "KOSDAQ"):
        for page in range(1, 60):
            j = get(f"https://m.stock.naver.com/api/stocks/marketValue/{market}?page={page}&pageSize=100")
            items = j.get("stocks") or j.get("result") or []
            for it in items:
                code, name = it.get("itemCode"), it.get("stockName")
                if code and name and re.fullmatch(r"\d{6}", code):
                    out[name] = code
            if len(items) < 100:
                break
    if not out:  # 예비: markets.py 가 만들어 둔 목록
        f = DATA / "krx_list.json"
        if f.exists():
            out = json.loads(f.read_text("utf-8"))
    return out


def daily(code, count=430):
    """네이버 일봉 [날짜, 시, 고, 저, 종, 거래량] — 장중이면 마지막 봉이 오늘 진행 중인 봉."""
    txt = get(f"https://fchart.stock.naver.com/sise.nhn?symbol={code}&timeframe=day&count={count}&requestType=0", as_json=False)
    rows = []
    for m in re.finditer(r'data="(\d{8})\|([\d.]+)\|([\d.]+)\|([\d.]+)\|([\d.]+)\|([\d.]*)', txt):
        o, h, l, c = (float(m.group(i)) for i in range(2, 6))
        if c > 0 and h > 0:
            rows.append([m.group(1), o, h, l, c, float(m.group(6) or 0)])
    return rows


def ma(closes, n, end):
    """closes[end-n+1 .. end] 평균 (end 포함). 데이터 모자라면 None."""
    if end - n + 1 < 0:
        return None
    return sum(closes[end - n + 1:end + 1]) / n


def signal_at(rows, i, wick, near):
    """i번째 봉이 조건을 만족하면 (200선, 400선) 반환, 아니면 None."""
    if i < 400:
        return None
    closes = [r[4] for r in rows]
    m200, m400 = ma(closes, 200, i), ma(closes, 400, i)
    p200, p400 = ma(closes, 200, i - 1), ma(closes, 400, i - 1)
    _, o, h, l, c, _ = rows[i]
    prev_c = rows[i - 1][4]
    if not (prev_c < max(p200, p400) and c > max(m200, m400)):
        return None
    if c <= o or h <= l:
        return None
    if (h - c) > (h - l) * wick or c < h * near:
        return None
    return m200, m400


def n_pattern(rows, rise_min=0.15, rise_max_days=10, look=25, retr_lo=0.236, retr_hi=0.618):
    """N자 눌림목 (상승 → 눌림 → 재상승) — 오늘 봉 기준.
    상승: 최근 look일 안의 고점(H)이, 그 전 rise_max_days일 안 저점(L)보다 rise_min 이상 높다.
    눌림: 고점 이후 최저가가 상승폭의 retr_lo~retr_hi 만큼 되돌림(시작 저점 L 은 안 깨짐), 고점 후 2일 이상 지남.
    상태: '재상승' = 오늘 양봉이고 종가 > 어제 고가 / '눌림 중' = 아직 반등 확인 전."""
    n = len(rows)
    if n < look + rise_max_days + 2:
        return None
    hi_i = max(range(n - look, n - 2), key=lambda i: rows[i][2])  # 고점은 최소 2봉 전
    H = rows[hi_i][2]
    lo_i = min(range(max(0, hi_i - rise_max_days), hi_i + 1), key=lambda i: rows[i][3])
    L = rows[lo_i][3]
    if L <= 0 or H / L - 1 < rise_min:
        return None
    pb_i = min(range(hi_i + 1, n), key=lambda i: rows[i][3])
    P = rows[pb_i][3]
    retr = (H - P) / (H - L)
    if not (retr_lo <= retr <= retr_hi):
        return None
    d, o, h, l, c, v = rows[-1]
    if c >= H:  # 이미 고점 돌파 → 눌림목 자리 지남
        return None
    state = "재상승" if (c > o and c > rows[-2][2] and pb_i < n - 1) else "눌림 중"
    return {"rise%": round((H / L - 1) * 100, 1), "high": int(H), "high_date": rows[hi_i][0],
            "pullback_low": int(P), "retrace%": round(retr * 100, 1), "state": state,
            "to_high%": round((H / c - 1) * 100, 1)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--wick", type=float, default=0.2, help="윗꼬리 허용 비율(고가-저가 폭 대비)")
    ap.add_argument("--near", type=float, default=0.98, help="종가 >= 고가 * near")
    ap.add_argument("--days", type=int, default=5, help="최근 며칠 안의 돌파까지 '버티는지' 확인")
    a = ap.parse_args()

    names = krx_list()
    print(f"종목 {len(names)}개 확인 시작 (윗꼬리≤{a.wick:.0%}, 종가≥고가×{a.near}, 최근 {a.days}거래일)")
    today_hits, recent_hits, n_hits, fail = [], [], [], 0
    from concurrent.futures import ThreadPoolExecutor

    def fetch(item):
        try:
            return item, daily(item[1])
        except Exception:
            return item, None

    with ThreadPoolExecutor(max_workers=8) as ex:
        fetched = list(ex.map(fetch, sorted(names.items(), key=lambda x: x[1])))
    for k, ((name, code), rows) in enumerate(fetched):
        if rows is None:
            fail += 1
            continue
        np_ = n_pattern(rows)
        if np_:
            d, o, h, l, c, v = rows[-1]
            n_hits.append({"name": name, "code": code, "close": int(c),
                           "chg%": round((c / rows[-2][4] - 1) * 100, 2), "value_억": round(c * v / 1e8, 1), **np_})
        if len(rows) < 402:
            continue
        closes = [r[4] for r in rows]
        last = len(rows) - 1
        for i in range(max(401, last - a.days), last + 1):
            sig = signal_at(rows, i, a.wick, a.near)
            if not sig:
                continue
            d, o, h, l, c, v = rows[i]
            chg = (c / rows[i - 1][4] - 1) * 100
            # 돌파 이후(다음 봉부터 마지막 봉까지) 종가가 200일선 위에 있었는지
            held = all(closes[j] > ma(closes, 200, j) for j in range(i + 1, last + 1))
            rec = {"date": d, "name": name, "code": code, "close": int(c), "chg%": round(chg, 2),
                   "ma200": int(sig[0]), "ma400": int(sig[1]),
                   "wick%": round((h - c) / (h - l) * 100, 1), "after_days": last - i,
                   "held_200": "오늘" if i == last else ("유지" if held else "이탈"),
                   "now": int(closes[last]), "now_vs_200%": round((closes[last] / ma(closes, 200, last) - 1) * 100, 1)}
            (today_hits if i == last else recent_hits).append(rec)

    stamp = datetime.now(KST).strftime("%Y%m%d-%H%M")
    print(f"\n=== 오늘 조건 충족 {len(today_hits)}종목 ({stamp} KST 기준 가격) ===")
    for r in sorted(today_hits, key=lambda r: -r["chg%"]):
        print(f"  {r['name']}({r['code']}) {r['close']:,}원 {r['chg%']:+.1f}%  200선 {r['ma200']:,} / 400선 {r['ma400']:,}  윗꼬리 {r['wick%']}%")
    print(f"\n=== 최근 {a.days}거래일 돌파 후 200일선 위 유지 여부 ===")
    for r in sorted(recent_hits, key=lambda r: r["date"], reverse=True):
        print(f"  {r['date']} {r['name']}({r['code']}) 돌파 종가 {r['close']:,} → 지금 {r['now']:,} (200선 대비 {r['now_vs_200%']:+.1f}%)  {r['held_200']}")
    reb = [r for r in n_hits if r["state"] == "재상승"]
    print(f"\n=== N자 눌림목: 재상승 시작 {len(reb)}종목 / 눌림 중 {len(n_hits) - len(reb)}종목 (거래대금 상위 20) ===")
    for r in sorted(n_hits, key=lambda r: (r["state"] != "재상승", -r["value_억"]))[:40]:
        print(f"  [{r['state']}] {r['name']}({r['code']}) {r['close']:,}원 {r['chg%']:+.1f}%  상승 {r['rise%']}% → 되돌림 {r['retrace%']}%  고점 {r['high']:,}({r['high_date']})까지 {r['to_high%']}%  거래대금 {r['value_억']}억")
    if fail:
        print(f"\n(시세 못 받은 종목 {fail}개)")
    nout = DATA / f"screen_n_{datetime.now(KST).strftime('%Y%m%d-%H%M')}.csv"
    DATA.mkdir(exist_ok=True)
    if n_hits:
        with nout.open("w", newline="", encoding="utf-8-sig") as f:
            w = csv.DictWriter(f, fieldnames=list(n_hits[0].keys()))
            w.writeheader()
            w.writerows(n_hits)

    DATA.mkdir(exist_ok=True)
    out = DATA / f"screen_{stamp}.csv"
    allrows = today_hits + recent_hits
    with out.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(allrows[0].keys()) if allrows else ["date"])
        w.writeheader()
        w.writerows(allrows)
    print(f"\n저장: {out}")
    print("⚠ 본인 확인용. 조건 검증(백테스트·워크포워드) 전에는 이 목록으로 실거래하지 않는다.")


if __name__ == "__main__":
    main()

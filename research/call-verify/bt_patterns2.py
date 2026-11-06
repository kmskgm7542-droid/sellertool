"""두 패턴 백테스트 v2 — (1) 시장 국면 필터 (2) 손절 규칙을 더해 비교 (본인 검증용).

  필터: 신호일에 종목이 속한 지수(코스피/코스닥) 종가 > 지수 20일선 일 때만 진입
  손절(종가 기준, 그날 종가에 청산):
    패턴1 돌파  — 종가가 200일선 아래로 내려오면
    패턴2 N자   — 종가가 눌림 저점 아래로 내려오면
  손절이 안 나면 N거래일 뒤 종가에 청산. 왕복 비용 0.25% 차감. 진입은 신호일 종가.
  네 가지(기본 / 필터만 / 손절만 / 필터+손절)를 1년 전체·앞 6개월·뒤 6개월로 나눠 본다.
  기준선은 각 기간의 '아무 날이나 종가 매수 후 N일 보유' 평균(기간별로 따로 계산).
  숫자 기준은 미리 정한 값 그대로이며 결과를 보고 고치지 않았다(과최적화 방지).

  실행: python bt_patterns2.py   (bt_patterns.py 가 만든 data/bt_cache/ 시세 재사용)
"""
import json
import re
import statistics as st
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_prices import get  # noqa: E402
from screen_breakout import daily, n_pattern  # noqa: E402
from bt_patterns import CACHE, COST, EXCLUDE, TEST_DAYS, load  # noqa: E402

HZ = (5, 10, 20)


def market_map():
    out = {}
    for market in ("KOSPI", "KOSDAQ"):
        for page in range(1, 60):
            j = get(f"https://m.stock.naver.com/api/stocks/marketValue/{market}?page={page}&pageSize=100")
            items = j.get("stocks") or j.get("result") or []
            for it in items:
                code, name = it.get("itemCode"), it.get("stockName")
                if code and name and re.fullmatch(r"\d{6}", code):
                    out[code] = (name, market)
            if len(items) < 100:
                break
    return out


def regime(sym):
    rows = daily(sym, 720)
    ok, closes = {}, []
    for r in rows:
        closes.append(r[4])
        if len(closes) >= 20:
            ok[r[0]] = r[4] > sum(closes[-20:]) / 20
    return ok


def run_trade(rows, i, h, stop_fn):
    """i일 종가 진입 → h일 안에 stop_fn(j) 참이면 그날 종가 청산, 아니면 i+h 종가. 수익률(%)과 보유일."""
    entry = rows[i][4]
    end = min(i + h, len(rows) - 1)
    if end == i:
        return None
    for j in range(i + 1, end + 1):
        if stop_fn and stop_fn(j):
            return (rows[j][4] / entry - 1) * 100 - COST, j - i, True
    if i + h >= len(rows):
        return None
    return (rows[end][4] / entry - 1) * 100 - COST, h, False


def table(trades, base, label):
    print(f"\n  [{label}] 신호 {len(trades)}건")
    if not trades:
        return
    print("    보유 | 건수 |  승률 |  평균  | 중간값 | 기준선 | 초과   | 손절률 | 평균보유")
    for h in HZ:
        r = [t[h] for t in trades if t.get(h)]
        if not r:
            continue
        ret = [x[0] for x in r]
        win = sum(x > 0 for x in ret) / len(ret) * 100
        stp = sum(x[2] for x in r) / len(r) * 100
        b = base[h]
        print(f"    {h:>3}일 | {len(r):>4} | {win:4.0f}% | {st.mean(ret):+5.2f}% | {st.median(ret):+5.2f}% | {b:+5.2f}% | {st.mean(ret) - b:+5.2f}%p | {stp:4.0f}% | {st.mean(x[1] for x in r):4.1f}일")


def main():
    mm = market_map()
    names = {c: v for c, v in mm.items() if not EXCLUDE.search(v[0])}
    reg = {"KOSPI": regime("KOSPI"), "KOSDAQ": regime("KOSDAQ")}
    data = []
    for code, (name, mkt) in sorted(names.items()):
        f = CACHE / f"{code}.json"
        rows = json.loads(f.read_text()) if f.exists() else load((name, code))[2]
        if rows and len(rows) > 450:
            data.append((name, code, mkt, rows))
    all_dates = sorted({r[0] for *_, rows in data for r in rows})
    test_dates = all_dates[-TEST_DAYS:]
    start, mid = test_dates[0], test_dates[len(test_dates) // 2]
    print(f"개별주 {len(data)}개, 기간 {start}~{test_dates[-1]}, 앞/뒤 경계 {mid}")
    up_days = sum(reg['KOSDAQ'].get(d, False) for d in test_dates)
    print(f"코스닥 20일선 위였던 날: {up_days}/{len(test_dates)}일")

    trades = {p: [] for p in ("p1", "p2")}
    base = {per: {h: [0.0, 0] for h in HZ} for per in ("all", "front", "back")}
    for name, code, mkt, rows in data:
        idx0 = next((k for k, r in enumerate(rows) if r[0] >= start), None)
        if idx0 is None:
            continue
        pre = [0.0]
        for r in rows:
            pre.append(pre[-1] + r[4])

        def m(n, j):
            return (pre[j + 1] - pre[j + 1 - n]) / n if j + 1 - n >= 0 else None

        last2 = -99
        for i in range(max(idx0, 401), len(rows)):
            d, o, hi, lo, c, v = rows[i]
            per = "front" if d < mid else "back"
            for h in HZ:
                if i + h < len(rows):
                    x = (rows[i + h][4] / c - 1) * 100
                    for p in ("all", per):
                        base[p][h][0] += x
                        base[p][h][1] += 1
            mk_ok = reg[mkt].get(d, False)
            # 패턴1
            if (rows[i - 1][4] < max(m(200, i - 1), m(400, i - 1)) and c > max(m(200, i), m(400, i))
                    and c > o and hi > lo and (hi - c) <= (hi - lo) * 0.2 and c >= hi * 0.98):
                t = {"date": d, "per": per, "mk": mk_ok}
                for h in HZ:
                    t[("plain", h)] = run_trade(rows, i, h, None)
                    t[("stop", h)] = run_trade(rows, i, h, lambda j: rows[j][4] < m(200, j))
                trades["p1"].append(t)
            # 패턴2
            if i - last2 >= 10:
                np_ = n_pattern(rows[max(0, i - 60):i + 1])
                if np_ and np_["state"] == "재상승":
                    P = np_["pullback_low"]
                    t = {"date": d, "per": per, "mk": mk_ok}
                    for h in HZ:
                        t[("plain", h)] = run_trade(rows, i, h, None)
                        t[("stop", h)] = run_trade(rows, i, h, lambda j, P=P: rows[j][4] < P)
                    trades["p2"].append(t)
                    last2 = i
    base = {p: {h: s / n for h, (s, n) in v.items()} for p, v in base.items()}

    for p, label in (("p1", "패턴1 200·400일선 동시 돌파"), ("p2", "패턴2 N자 눌림목 재상승")):
        print("\n" + "=" * 78 + f"\n{label}")
        for per, plabel in (("all", "1년 전체"), ("front", "앞 6개월"), ("back", "뒤 6개월")):
            tr = [t for t in trades[p] if per == "all" or t["per"] == per]
            print(f"\n ── {plabel} ──")
            for variant, filt, mode in (("기본", False, "plain"), ("필터만", True, "plain"),
                                        ("손절만", False, "stop"), ("필터+손절", True, "stop")):
                sel = [t for t in tr if (t["mk"] or not filt)]
                table([{h: t[(mode, h)] for h in HZ} for t in sel], base[per], variant)


if __name__ == "__main__":
    main()

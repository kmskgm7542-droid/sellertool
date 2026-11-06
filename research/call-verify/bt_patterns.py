"""두 패턴 1년 백테스트 (본인 검증용) — screen_breakout.py 의 조건을 과거 매일에 그대로 적용.

  패턴1 돌파: 200·400일선 동시 돌파 + 윗꼬리 ≤ 20% + 종가 ≥ 고가×0.98 (screen_breakout.signal_at)
  패턴2 N자: 상승 15%+ → 23.6~61.8% 되돌림 → 재상승 양봉 (screen_breakout.n_pattern, 그날까지 데이터만 사용)

  진입: 신호일 종가(= 장 마감 직전 매수 가정) / 비교용으로 다음날 시가 진입도 계산
  성과: 1·3·5·10·20거래일 뒤 종가 수익률, 왕복 비용 0.25% 차감
  기준선: 같은 기간 같은 종목군의 '아무 날이나 종가 매수' 평균 수익률
  워크포워드 확인: 앞 6개월 / 뒤 6개월 결과를 따로 본다.

  실행: python bt_patterns.py   (시세는 data/bt_cache/ 에 저장, 레포에 올라가지 않음)
"""
import json
import re
import statistics as st
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from screen_breakout import daily, krx_list, n_pattern, signal_at  # signal_at 과 같은 조건을 누적합으로 빠르게 계산  # noqa: E402

DATA = Path(__file__).resolve().parent / "data"
CACHE = DATA / "bt_cache"
COST = 0.25  # % 왕복(수수료+세금+슬리피지 대략)
HZ = (1, 3, 5, 10, 20)
TEST_DAYS = 250  # 최근 1년
EXCLUDE = re.compile(r"ETN|ETF|KODEX|TIGER|RISE|ACE |PLUS |KIWOOM|WON |스팩|SOL |HANARO|KOSEF|에셋플러스|BNK |1Q |TIME |파워 |마이티|히어로즈|TRUSTON|UNICORN|VITA|DAISHIN|KCGI|ITF|리츠")


def load(item):
    name, code = item
    f = CACHE / f"{code}.json"
    if f.exists():
        return name, code, json.loads(f.read_text())
    try:
        rows = daily(code, 720)
    except Exception:
        return name, code, None
    f.write_text(json.dumps(rows))
    return name, code, rows


def fwd(rows, i, entry):
    out = {}
    for h in HZ:
        if i + h < len(rows):
            out[h] = (rows[i + h][4] / entry - 1) * 100 - COST
    return out


def summarize(trades, label):
    print(f"\n[{label}] 신호 {len(trades)}건")
    if not trades:
        return
    print("  보유일 |   건수 |  승률 |  평균  | 중간값 | 기준선 평균 | 초과")
    for h in HZ:
        r = [t["r"][h] for t in trades if h in t["r"]]
        b = [t["base"][h] for t in trades if h in t["base"]]
        if not r:
            continue
        win = sum(x > 0 for x in r) / len(r) * 100
        print(f"  {h:>4}일 | {len(r):>6} | {win:4.0f}% | {st.mean(r):+5.2f}% | {st.median(r):+5.2f}% |   {st.mean(b):+5.2f}%   | {st.mean(r) - st.mean(b):+5.2f}%p")


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    names = {n: c for n, c in krx_list().items() if not EXCLUDE.search(n)}
    print(f"개별주 {len(names)}개 시세 준비 (캐시 {len(list(CACHE.glob('*.json')))}개)")
    with ThreadPoolExecutor(max_workers=8) as ex:
        data = [d for d in ex.map(load, sorted(names.items())) if d[2] and len(d[2]) > 450]
    print(f"시세 확보 {len(data)}개")

    # 공통 날짜축: 최근 TEST_DAYS 거래일
    all_dates = sorted({r[0] for _, _, rows in data for r in rows})
    test_dates = all_dates[-TEST_DAYS:]
    start, mid = test_dates[0], test_dates[len(test_dates) // 2]
    print(f"검증 기간 {start} ~ {test_dates[-1]} (앞/뒤 경계 {mid})")

    p1, p2 = [], []
    base_sum = {h: [0.0, 0] for h in HZ}  # 전체 종목-일 기준선
    for name, code, rows in data:
        idx0 = next((k for k, r in enumerate(rows) if r[0] >= start), None)
        if idx0 is None:
            continue
        last2 = -99
        pre = [0.0]
        for r in rows:
            pre.append(pre[-1] + r[4])
        def m(n, j):  # j번째 봉까지 n일 평균
            return (pre[j + 1] - pre[j + 1 - n]) / n if j + 1 - n >= 0 else None

        def sig1(i):
            if i < 400:
                return False
            _, o, h, l, c, _ = rows[i]
            if not (rows[i - 1][4] < max(m(200, i - 1), m(400, i - 1)) and c > max(m(200, i), m(400, i))):
                return False
            return c > o and h > l and (h - c) <= (h - l) * 0.2 and c >= h * 0.98

        for i in range(max(idx0, 1), len(rows)):
            c = rows[i][4]
            base = fwd(rows, i, c)
            for h, v in base.items():
                base_sum[h][0] += v + COST  # 기준선은 비용 없이 '그냥 보유'
                base_sum[h][1] += 1
            val = c * rows[i][5] / 1e8  # 거래대금(억)
            if sig1(i):
                p1.append({"name": name, "date": rows[i][0], "r": base, "val": val,
                           "r_open": fwd(rows, i + 1, rows[i + 1][1]) if i + 1 < len(rows) else {},
                           "held": all(rows[j][4] > m(200, j) for j in range(i + 1, min(i + 6, len(rows))))})
            if i - last2 >= 10:
                np_ = n_pattern(rows[max(0, i - 60):i + 1])
                if np_ and np_["state"] == "재상승":
                    p2.append({"name": name, "date": rows[i][0], "r": base, "val": val,
                               "r_open": fwd(rows, i + 1, rows[i + 1][1]) if i + 1 < len(rows) else {}})
                    last2 = i
    base_avg = {h: s / n for h, (s, n) in base_sum.items() if n}
    for t in p1 + p2:
        t["base"] = base_avg

    for label, tr in (("패턴1 200·400일선 동시 돌파", p1), ("패턴2 N자 눌림목 재상승", p2)):
        print("\n" + "=" * 70)
        summarize(tr, f"{label} — 전체, 신호일 종가 진입")
        summarize([t for t in tr if t["val"] >= 10], f"{label} — 거래대금 10억 이상")
        summarize([{**t, "r": t["r_open"]} for t in tr], f"{label} — 다음날 시가 진입")
        summarize([t for t in tr if t["date"] < mid], f"{label} — 앞 6개월")
        summarize([t for t in tr if t["date"] >= mid], f"{label} — 뒤 6개월")
        if tr is p1:
            held = [t for t in tr if t["held"]]
            print(f"\n  돌파 후 5일 동안 200일선 위 유지: {len(held)}/{len(tr)}건 ({len(held) / max(1, len(tr)) * 100:.0f}%)"
                  "  ※ 유지 여부는 사후에야 알 수 있는 정보라 매수 조건으로는 쓸 수 없음")

    out = DATA / "bt_trades.json"
    out.write_text(json.dumps({"p1": p1, "p2": p2}, ensure_ascii=False))
    print(f"\n거래 목록 저장: {out}")


if __name__ == "__main__":
    main()

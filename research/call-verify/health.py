"""매일 건강검진 — 수집·추출·검증이 '조용히' 실패하지 않았는지 숫자로 확인해 data/health.txt 에 남긴다.
  실행: daily_run.bat 이 드라이브 업로드 직전에 자동 실행 (직접: python health.py)
  결과: data/health.txt (맨 위 줄 = 경보 건수), data/health_state.json (날짜별 기록 — 봇 offset·게시글 수·검증 대상 수)
  경보(⚠)가 있으면 그날 밤 검토 보고 맨 위에 올린다. 콜 원문은 data/ 와 드라이브에만 두고 레포에는 올리지 않는다.

  점검 항목과 경보 기준 (콜 수집 장애 예방·대응 계획, 2026-11-12):
    1 봇 수신          평일 2일 연속 새 메시지 0건(offset 변화 없음)
    2 방송 자막         방송을 처음 본 뒤 30시간이 지나도록 자막을 못 받음 / 재시도 기간이 끝남
    3 방송 추출         최근 방송 3개 연속 자동추출·검토 후보 모두 0건
    4 못 알아본 이름     자막의 영문·숫자 약칭(예: LK3, ICTK)이 매매 표현 옆에 2회 이상 나오는데 종목 목록·별칭에 없음
    5 게시판 → 장부     최근 3일 게시글 중 매수 표현과 숫자가 있는데 장부에 없는 글
    6 종목코드 없음      장부에 '시장·종목코드 입력 필요' 행이 있음
    7 종목 목록·디스크   7일 넘게 갱신 안 됨, 업비트 50·국내 500종목 미만, data 드라이브 여유 5GB 미만
    8 오류 로그         이번 실행 daily.log, 지난 드라이브 업로드 로그에 오류·실패
    9 검증 대상 수      전날보다 줄어듦
"""
import csv
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
OUT = DATA / "health.txt"
STATE = DATA / "health_state.json"
KST = timezone(timedelta(hours=9))
CALL_WORDS = re.compile(r"매수|손절|목표|익절|진입|잡아|사도|사세|들어가|컷")
# 방송에서 흔히 나오는 영문 약어(종목이 아님)
STOP = {
    "AI", "ETF", "ETN", "KOSPI", "KOSDAQ", "USA", "US", "MACD", "RSI", "OBV", "CCI", "BB", "MA", "EMA", "SMA", "PER",
    "PBR", "ROE", "EPS", "IPO", "CEO", "CPI", "PPI", "FOMC", "FED", "GDP", "OK", "TV", "PC", "LIVE", "VIP", "NFT", "DEX",
    "IT", "VS", "AM", "PM", "KRW", "USD", "USDT", "ATH", "TP", "SL", "AI의", "YOLO", "MVRV", "HTS", "MTS", "DM", "Q", "WTI", "SNS", "PD",
}


def load(p, default):
    try:
        return json.loads(Path(p).read_text("utf-8-sig"))
    except Exception:
        return default


def read_ledger():
    f = DATA / "ledger.csv"
    if not f.exists():
        return []
    with open(f, encoding="utf-8-sig") as fh:
        return list(csv.DictReader(fh))


def default_aliases():
    """aliases.mjs 의 DEFAULT_ALIASES 키(기본 별칭) + 봇 등록 별칭(data/aliases.json) 키"""
    keys = set(load(DATA / "aliases.json", {}).keys())
    try:
        src = (HERE / "aliases.mjs").read_text("utf-8")
        block = src.split("DEFAULT_ALIASES = {", 1)[1].split("};", 1)[0]
        keys |= {m.group(1) or m.group(2) for m in re.finditer(r"^\s*(?:'([^']+)'|([^\s:'/]+))\s*:", block, re.M)}
    except Exception:
        pass
    return keys


def is_weekday(d):
    return datetime.strptime(d, "%Y-%m-%d").weekday() < 5


def main():
    now = datetime.now(KST)
    today = now.strftime("%Y-%m-%d")
    st = load(STATE, {})
    alerts, oks = [], []

    def ok(msg):
        oks.append("✅ " + msg)

    def warn(msg):
        alerts.append("⚠ " + msg)

    # 1) 봇 수신 — 날짜별 마지막 offset. 평일인 날 offset 이 전날 기록과 같으면 '0건인 날'
    offset = load(DATA / "live_state.json", {}).get("offset")
    bot = st.setdefault("bot", {})
    if offset is not None:
        bot[today] = offset
    days = sorted(bot)
    zero_weekdays = []
    for prev, cur in zip(days, days[1:]):
        if is_weekday(cur):
            zero_weekdays.append((cur, bot[cur] == bot[prev]))
    recent = zero_weekdays[-2:]
    if offset is None:
        warn("봇: live_state.json 이 없어 수신 여부를 알 수 없음")
    elif len(recent) < 2:
        ok(f"봇: 기록 쌓는 중(offset {offset})")
    elif all(z for _, z in recent):
        warn(f"봇: 평일 {recent[0][0]}·{recent[1][0]} 연속 새 메시지 0건(offset {offset}) — PowerShell 점검 필요")
    else:
        got = [d for d, z in zero_weekdays[-5:] if not z]
        ok(f"봇: 최근 평일 수신 있음({', '.join(got[-2:])}), offset {offset}")

    # 2) 방송 자막
    yl = load(DATA / "yt_live_state.json", {}).get("videos", {})
    late = []
    for vid, v in yl.items():
        if v.get("done") or not v.get("first_seen"):
            continue
        try:
            age_h = (datetime.now(timezone.utc) - datetime.fromisoformat(v["first_seen"])).total_seconds() / 3600
        except Exception:
            continue
        if age_h > 30:
            late.append(f"{(v.get('title') or vid)[:30]}({age_h / 24:.1f}일{', 재시도 종료' if age_h > 72 else ''})")
    if late:
        warn(f"방송 자막: 30시간 넘게 못 받은 방송 {len(late)}개 — {'; '.join(late[:3])}")
    else:
        ok(f"방송 자막: 밀린 방송 없음(받은 방송 {sum(1 for v in yl.values() if v.get('done'))}개)")

    # 3) 방송 추출 — 최근 방송 3개(방송 시작 시각 순)
    ex = load(DATA / "extract_state.json", {}).get("videos", {})
    vods = []
    for f in (DATA / "live_vod").glob("*.json") if (DATA / "live_vod").is_dir() else []:
        v = load(f, {})
        vods.append((v.get("startUnix") or 0, f.stem, v))
    vods.sort()
    last3 = [(vid, ex.get(vid, {})) for _, vid, _ in vods[-3:]]
    if len(last3) == 3 and all(e and not e.get("calls") and not e.get("review") for _, e in last3):
        warn("방송 추출: 최근 방송 3개 연속 자동추출·검토 후보 모두 0건 — 자막 원문 직접 대조 필요")
    else:
        ok("방송 추출: " + ", ".join(f"{(e.get('title') or vid)[9:20].strip()} 추출 {e.get('calls', '-')}·후보 {e.get('review', '-')}" for vid, e in last3))

    # 4) 못 알아본 영문·숫자 이름 — 최근 방송 3개
    krx = load(DATA / "krx_list.json", {})
    up = load(DATA / "upbit_markets.json", {})
    tickers = {m.split("-", 1)[-1] for m in up.values()}
    names = set(krx) | set(up) | default_aliases()
    known = lambda tok: tok in names or tok in tickers or tok in STOP or any(n.startswith(tok) for n in names)  # noqa: E731
    cnt = {}
    for _, _, v in vods[-3:]:
        segs = v.get("segments") or []
        for i, s in enumerate(segs):
            near = " ".join(x.get("text", "") for x in segs[max(0, i - 2): i + 4])  # 앞 2·뒤 3구간(약 1분)
            if not CALL_WORDS.search(near):
                continue
            # 뒤에 '님'이 붙으면 시청자 닉네임(예: "G63님")이라 뺀다
            for tok in set(re.findall(r"(?<![A-Za-z0-9])([A-Z][A-Z0-9]{1,5}(?:\s?\d)?)(?![A-Za-z0-9]|\s?님)", s.get("text", ""))):
                tok = tok.replace(" ", "")  # "LK 3" = "LK3"
                if not known(tok):
                    cnt[tok] = cnt.get(tok, 0) + 1
    odd = sorted((k for k, n in cnt.items() if n >= 2), key=lambda k: -cnt[k])
    if odd:
        warn("못 알아본 이름: " + ", ".join(f"{k}({cnt[k]}회)" for k in odd[:6]) + " — 종목이면 기본 별칭 추가")
    else:
        ok("못 알아본 이름: 없음")

    # 5) 게시판 → 장부
    ledger = read_ledger()
    ids = {re.sub(r"-\d+$", "", r["id"]) for r in ledger}
    posts = load(DATA / "yt_result.json", {}).get("messages", [])
    cut = now.timestamp() - 3 * 86400
    missing = []
    for m in posts:
        t = m.get("date_unixtime") or 0
        text = m.get("text") if isinstance(m.get("text"), str) else ""
        if t < cut or m.get("date_precision") in ("week", "month", "year", "unknown"):
            continue
        if re.search(r"매수|진입|현재가", text) and re.search(r"\d", text) and f"yt{m.get('id')}" not in ids:
            missing.append(f"yt{m.get('id')} {datetime.fromtimestamp(t, KST):%m-%d %H:%M} {text[:30].strip()}")
    if missing:
        warn(f"게시판 → 장부: 매수·숫자가 있는데 장부에 없는 최근 글 {len(missing)}건(손절 표현 없음·중복 판정 포함) — {'; '.join(missing[:3])}")
    else:
        ok(f"게시판 → 장부: 최근 3일 빠진 글 없음(게시글 {len(posts)}건)")

    # 6) 종목코드 없음
    nocode = [r for r in ledger if "종목코드 입력 필요" in (r.get("flags") or "")]
    if nocode:
        warn(f"종목코드 없음: 장부 {len(nocode)}행 — " + ", ".join(f"{r['id']} {r.get('name') or '(종목?)'}" for r in nocode[:6]))
    else:
        ok("종목코드 없음: 0행")

    # 7) 종목 목록
    probs = []
    for fn, need in (("upbit_markets.json", 50), ("krx_list.json", 500)):
        f = DATA / fn
        if not f.exists():
            probs.append(f"{fn} 없음")
            continue
        age = (now.timestamp() - f.stat().st_mtime) / 86400
        n = len(load(f, {}))
        if age > 7 or n < need:
            probs.append(f"{fn} {n}종목·{age:.0f}일 전")
    # 디스크 여유 — data 폴더가 있는 드라이브(D 로 옮겼으면 D). 5GB 미만이면 경보
    try:
        import shutil
        free_gb = shutil.disk_usage(DATA.resolve()).free / 1e9
        drive = DATA.resolve().drive or "/"
        if free_gb < 5:
            probs.append(f"{drive} 여유 공간 {free_gb:.1f}GB(5GB 미만)")
        else:
            oks.append(f"✅ 디스크: data 위치 {DATA.resolve()} · 여유 {free_gb:.0f}GB")
    except Exception:
        pass
    if probs:
        warn("종목 목록·디스크: " + ", ".join(probs))
    else:
        ok(f"종목 목록: 업비트 {len(up)}·국내 {len(krx)}종목, 최신")

    # 8) 오류 로그 — 이번 실행 구간 + 지난 드라이브 업로드
    errs = []
    log = DATA / "daily.log"
    if log.exists():
        body = log.read_text("utf-8", errors="replace")
        part = body[body.rfind("daily_run 시작"):] if "daily_run 시작" in body else body[-20000:]
        errs += [ln.strip()[:80] for ln in part.splitlines() if re.search(r"Traceback|Error|실패|✖", ln)]
    up_log = DATA / "drive_upload_run.log"
    if up_log.exists():
        tail = up_log.read_text("utf-8", errors="replace")[-4000:]
        errs += ["드라이브: " + ln.strip()[:70] for ln in tail.splitlines() if re.search(r"Traceback|Error|실패", ln)]
    if errs:
        warn(f"오류 로그 {len(errs)}줄 — " + " / ".join(errs[:3]))
    else:
        ok("오류 로그: 없음")

    # 9) 검증 대상 수
    usable = sum(1 for r in ledger if r.get("ok") == "1")
    hist = st.setdefault("usable", {})
    prev = [hist[d] for d in sorted(hist) if d < today]
    hist[today] = usable
    if prev and usable < prev[-1]:
        warn(f"검증 대상: {prev[-1]}건 → {usable}건으로 줄어듦 — 장부에서 행이 사라진 이유 확인")
    else:
        ok(f"검증 대상: {usable}건" + (f"(전날 {prev[-1]})" if prev else ""))

    # 기록은 최근 60일만
    for k in ("bot", "usable"):
        st[k] = {d: st[k][d] for d in sorted(st[k])[-60:]}
    STATE.write_text(json.dumps(st, ensure_ascii=False, indent=1), "utf-8")
    head = f"건강검진 {now:%Y-%m-%d %H:%M} KST — 경보 {len(alerts)}건"
    OUT.write_text("\n".join([head, *alerts, *oks]) + "\n", "utf-8")
    print(head)
    for line in alerts:
        print(" ", line)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # 검진이 실패해도 업로드는 계속
        DATA.mkdir(exist_ok=True)
        OUT.write_text(f"건강검진 실패 — 경보 1건\n⚠ health.py 오류: {type(exc).__name__}: {exc}\n", "utf-8")
        print(f"건강검진 실패: {exc}")
        sys.exit(0)

"""
방송 자막에서 매수 타점을 뽑아 data/live_calls.json 에 넣고 텔레그램으로 요약을 보낸다.

  실행: python extract_calls.py           (daily_run.bat 이 yt_live.py 다음에 자동 실행)
        python extract_calls.py --dry      (텔레그램 전송·기록 없이 화면에만)
  준비: setup_ai.bat (Claude API 키 → data/anthropic.json). 키는 data/ 에만 둔다.

  방식: 자막을 12분 단위(1분 겹침)로 잘라 Claude 에게 "숫자로 제시된 매수 타점만" 구조화해 달라고 한다.
        숫자(손절·목표)가 하나도 없는 언급은 버린다. 뽑힌 콜은 게시판 콜과 같은 한 줄 형식으로 바꿔
        live_calls.json 에 넣고(시각 = 방송 시작 + 자막 오프셋), run.mjs parse 가 원장에 넣는다.
        자동 추출은 틀릴 수 있으므로 텔레그램 요약을 보고 "취소 <종목>" 으로 지울 수 있다.
"""
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
VOD = DATA / "live_vod"
FILE = DATA / "live_calls.json"
STATE = DATA / "extract_state.json"
CFG = DATA / "anthropic.json"
CHANNEL = "방송(자동추출)"
MODEL = "claude-opus-5"
CHUNK_SEC = 12 * 60
OVERLAP_SEC = 60
KST = timezone(timedelta(hours=9))

sys.path.insert(0, str(HERE))
from runlog import start as _start_log  # noqa: E402

_start_log("extract", DATA)


def load(p, default):
    return json.loads(p.read_text("utf-8")) if p.exists() else default


def save(p, obj):
    p.write_text(json.dumps(obj, ensure_ascii=False, indent=1), "utf-8")


SCHEMA = {
    "type": "object",
    "properties": {
        "calls": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "종목명(말한 그대로, 조사 제거)"},
                    "t_offset_sec": {"type": "number", "description": "이 언급이 시작된 자막 오프셋(초)"},
                    "quote": {"type": "string", "description": "근거가 된 자막 원문 한두 문장"},
                    "entry": {"type": ["number", "null"], "description": "진입 가격(원). 현재가 매수면 null"},
                    "entry_is_market": {"type": "boolean", "description": "'지금/현재가에 사도 된다'는 뜻이면 true"},
                    "sl": {"type": ["number", "null"], "description": "손절 가격(원). 말하지 않았으면 null"},
                    "tps": {"type": "array", "items": {"type": "number"}, "description": "목표 가격들(원), 오름차순"},
                    "horizon": {"type": ["string", "null"], "description": "기간 표현 그대로(예: '2주', '단기', '한 달'). 없으면 null"},
                    "stop_basis": {"type": ["string", "null"], "enum": ["TOUCH", "CLOSE_1H", "CLOSE_24H", None], "description": "손절 기준: 종가 언급이면 CLOSE_24H(일봉)/CLOSE_1H(1시간봉), 없으면 null"},
                    "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
                },
                "required": ["name", "t_offset_sec", "quote", "entry", "entry_is_market", "sl", "tps", "horizon", "stop_basis", "confidence"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["calls"],
    "additionalProperties": False,
}

SYSTEM = """당신은 한국 주식·코인 방송의 자동 생성 자막에서 '매수 타점'만 골라 구조화하는 기록원이다.

포함 기준(전부 충족):
- 진행자가 특정 종목을 지금 또는 특정 가격에 '매수'하라고 제시했고,
- 손절 가격 또는 목표 가격 중 하나 이상을 숫자로 말했다.
제외: 시황 설명, 과거 매매 복기, 보유자에 대한 '홀딩/익절' 조언, 가격 없는 관심 종목, 매도·공매도 관점, 다른 사람 질문을 읽은 것.

숫자 처리:
- "7만", "6만 8천", "1억 2천", "삼천오백원" 같은 표현은 원 단위 숫자로. 자막 오류("7만원" → "치만원")는 문맥으로 바로잡되 확신이 낮으면 confidence 를 low 로.
- 코인은 원화 가격. 퍼센트(예: "3% 손절")만 말했으면 sl 은 null 로 두고 quote 에 남긴다.
- 같은 종목을 여러 번 말했으면 가장 완전한 한 건만.

시각: t_offset_sec 는 각 자막 줄 앞의 [초] 값을 그대로 쓴다.
quote 는 자막 원문 그대로 짧게. 추측으로 채우지 말고 없으면 null."""


def chunks(segs):
    if not segs:
        return []
    end = segs[-1]["t"]
    out = []
    start = 0.0
    while start <= end:
        stop = start + CHUNK_SEC
        part = [s for s in segs if start - OVERLAP_SEC <= s["t"] < stop]
        if part:
            out.append((start, part))
        start = stop
    return out


def fmt_won(v):
    """파서가 단위 없는 숫자를 가격으로 안 볼 수 있으므로 항상 '원'을 붙인다."""
    if v is None:
        return None
    return f"{int(v) if float(v).is_integer() else v}원"


def to_line(c):
    name = re.sub(r"\s+", "", c["name"])
    entry = "현재가" if c["entry_is_market"] or c["entry"] is None else fmt_won(c["entry"])
    parts = [name, entry, "매수", "손절", fmt_won(c["sl"]) if c["sl"] is not None else "미제시"]
    if c["tps"]:
        parts += ["목표"] + [fmt_won(x) for x in sorted(c["tps"])]
    if c["horizon"]:
        parts.append(c["horizon"])
    if c["stop_basis"] == "CLOSE_24H":
        parts.append("일봉종가")
    elif c["stop_basis"] == "CLOSE_1H":
        parts.append("1시간종가")
    return " ".join(parts)


def extract(client, title, part):
    text = "\n".join(f"[{int(s['t'])}] {s['text']}" for s in part)
    resp = client.beta.messages.create(
        model=MODEL,
        max_tokens=8000,
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        system=SYSTEM,
        messages=[{"role": "user", "content": f"방송 제목: {title}\n\n자막(각 줄 앞 [초] = 방송 시작부터의 오프셋):\n{text}"}],
        output_config={"format": {"type": "json_schema", "schema": SCHEMA}},
    )
    if resp.stop_reason == "refusal":
        print("  ⚠ 모델이 응답을 거부했습니다:", getattr(resp.stop_details, "explanation", ""))
        return []
    out = next((b.text for b in resp.content if b.type == "text"), "{}")
    return json.loads(out).get("calls", [])


def main():
    dry = "--dry" in sys.argv
    try:
        import anthropic
    except ImportError:
        print("anthropic 패키지가 없습니다. live_vod.bat 으로 실행하세요.")
        sys.exit(1)
    cfg = load(CFG, {})
    if not cfg.get("api_key"):
        print("Claude API 키가 없습니다. setup_ai.bat 을 먼저 실행하세요.")
        sys.exit(1)
    client = anthropic.Anthropic(api_key=cfg["api_key"])
    state = load(STATE, {"videos": {}})
    live = load(FILE, {"name": "방송(직접 기록)", "messages": []})
    todo = [p for p in sorted(VOD.glob("*.json")) if p.stem not in state["videos"]]
    if not todo:
        print("새 방송 자막이 없습니다.")
        return
    summary = []
    for p in todo:
        v = load(p, {})
        segs = v.get("segments") or []
        start_unix = v.get("startUnix") or 0
        title = v.get("title", p.stem)
        print(f"▶ {title[:50]} — 자막 {len(segs)}구간, 시작 {v.get('startTimestamp') or '미상'}")
        found = []
        for i, (cs, part) in enumerate(chunks(segs)):
            try:
                calls = extract(client, title, part)
            except anthropic.AuthenticationError:
                print("  ✖ API 키가 틀렸습니다. setup_ai.bat 으로 다시 넣으세요.")
                sys.exit(1)
            except anthropic.RateLimitError as e:
                print(f"  ⚠ 요청 제한: {e.message}. 다음 실행에서 재시도")
                return
            except anthropic.APIStatusError as e:
                print(f"  ⚠ API 오류 {e.status_code}: {e.message}. 다음 실행에서 재시도")
                return
            for c in calls:
                if c["sl"] is None and not c["tps"]:
                    continue  # 숫자 없는 언급은 검증에 못 쓴다
                key = (re.sub(r"\s+", "", c["name"]), c["sl"], tuple(sorted(c["tps"])))
                if any(k == key and abs(t - c["t_offset_sec"]) < 600 for k, t in [(f["_key"], f["t_offset_sec"]) for f in found]):
                    continue  # 겹치는 구간에서 같은 콜
                c["_key"] = key
                found.append(c)
            print(f"  구간 {i + 1}: 후보 {len(calls)}건 (누적 {len(found)})")
        n0 = len(live["messages"])
        for k, c in enumerate(found, 1):
            t = start_unix + int(c["t_offset_sec"]) if start_unix else 0
            line = to_line(c)
            msg = {
                "id": f"vod{p.stem}_{k}", "type": "message", "channel": CHANNEL, "date_precision": "exact" if start_unix else "unknown",
                "date": datetime.fromtimestamp(t, KST).isoformat() if t else "", "date_unixtime": str(t),
                "name": re.sub(r"\s+", "", c["name"]), "text": line, "quote": c["quote"], "confidence": c["confidence"],
                "video": p.stem,
            }
            kst = datetime.fromtimestamp(t, KST).strftime("%m-%d %H:%M") if t else "시각미상"
            summary.append(f"· {kst} {line} ({ {'high': '확신 높음', 'medium': '보통', 'low': '낮음'}[c['confidence']] })")
            if not dry:
                live["messages"].append(msg)
        print(f"  → 타점 {len(found)}건 {'(dry)' if dry else '기록'}")
        if not dry:
            state["videos"][p.stem] = {"calls": len(found), "at": datetime.now(KST).isoformat(), "title": title}
            save(FILE, live)
            save(STATE, state)
        del n0
    if summary and not dry:
        try:
            from notify import cfg as tg_cfg, send_text
            text = "📺 방송 자막 자동추출 타점\n" + "\n".join(summary[:30]) + "\n\n틀린 건 '취소 <종목>' 으로 지우세요. 검증 규칙은 게시판 콜과 동일."
            send_text(tg_cfg(), text)
            print("텔레그램 요약 전송")
        except SystemExit:
            print("(텔레그램 봇 미설정 — 요약 전송 생략)")
        except Exception as exc:
            print(f"(텔레그램 전송 실패: {exc})")
    elif summary:
        print("\n".join(summary))
    else:
        print("숫자로 제시된 타점이 없었습니다.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"\n✖ 오류: {type(exc).__name__}: {exc}")
        sys.exit(1)

"""
방송(라이브 다시보기) 자막 수집기 — 대표 PC에서 실행. yt_posts.py 와 같은 로그인 프로필(data/yt_profile)을 쓴다.

  실행: python yt_live.py            (daily_run.bat 이 매일 21:30 에 자동 실행)
  결과: data/live_vod/<videoId>.json  — 자막 구간(offset 초, 문장) + 방송 시작 시각(정확)
        → extract_calls.py 가 이 파일에서 타점을 뽑는다.

  동작: 채널의 "실시간" 탭에서 최근 방송 목록을 읽고, 아직 처리 안 한 다시보기의 한국어 자막(자동 생성 포함)을 받는다.
        진행 중인 방송은 건너뛰고 다음 실행에 받는다. 자막이 아직 안 만들어졌으면 3일 동안 재시도.
  범위: 본인이 가입한 멤버십의 방송, 본인 검증용. 자막 파일은 data/ 에만 두고 재배포하지 않는다.
"""
import asyncio
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
sys.path.insert(0, str(HERE))
from runlog import start as _start_log  # noqa: E402

_start_log("yt_live", DATA)
try:
    from playwright.async_api import async_playwright
except ImportError:
    print("playwright 가 없습니다. live_vod.bat 으로 실행하세요.")
    sys.exit(1)

CFG = DATA / "yt_config.json"
PROFILE = DATA / "yt_profile"
VOD = DATA / "live_vod"
STATE = DATA / "yt_live_state.json"
MAX_VIDEOS = 8       # 실시간 탭에서 살펴볼 최근 방송 수
RETRY_DAYS = 3       # 자막 미생성 시 재시도 기간


def load(p, default):
    return json.loads(p.read_text("utf-8")) if p.exists() else default


def save(p, obj):
    p.write_text(json.dumps(obj, ensure_ascii=False, indent=1), "utf-8")


def walk(obj, key):
    """중첩 JSON 에서 key 를 가진 dict 를 전부 찾는다."""
    if isinstance(obj, dict):
        if key in obj:
            yield obj[key]
        for v in obj.values():
            yield from walk(v, key)
    elif isinstance(obj, list):
        for v in obj:
            yield from walk(v, key)


def runs_text(x):
    if not x:
        return ""
    if "simpleText" in x:
        return x["simpleText"]
    return "".join(r.get("text", "") for r in x.get("runs", []))


def pick_track(tracks):
    ko = [t for t in tracks if (t.get("languageCode") or "").startswith("ko")]
    if not ko:
        return None
    manual = [t for t in ko if t.get("kind") != "asr"]
    return (manual or ko)[0]


def parse_json3(j):
    segs = []
    for ev in j.get("events", []):
        text = "".join(s.get("utf8", "") for s in ev.get("segs", []) or []).replace("\n", " ").strip()
        if not text or "tStartMs" not in ev:
            continue
        segs.append({"t": round(ev["tStartMs"] / 1000, 1), "d": round(ev.get("dDurationMs", 0) / 1000, 1), "text": text})
    return segs


async def main():
    DATA.mkdir(exist_ok=True)
    VOD.mkdir(exist_ok=True)
    cfg = load(CFG, {})
    if not cfg.get("channel_url") or not cfg.get("logged_in"):
        print("먼저 yt_posts.bat 을 한 번 실행해 채널 주소와 로그인을 마쳐 주세요.")
        sys.exit(1)
    base = re.sub(r"/(posts|community|videos|streams|featured)$", "", cfg["channel_url"])
    state = load(STATE, {"videos": {}})
    now = datetime.now(timezone.utc)

    async with async_playwright() as pw:
        ctx = await pw.chromium.launch_persistent_context(
            str(PROFILE), headless=False, locale="ko-KR", viewport={"width": 1200, "height": 900},
            args=["--disable-blink-features=AutomationControlled"],
        )
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        await page.goto(base + "/streams", wait_until="domcontentloaded")
        await page.wait_for_timeout(3000)
        data = await page.evaluate("() => window.ytInitialData || null")
        if not data:
            print("⚠ 실시간 탭을 읽지 못했습니다(로그인 풀림 또는 화면 구조 변경). 브라우저 화면을 캡처해 주세요.")
            await ctx.close()
            return
        videos = []
        for v in walk(data, "videoRenderer"):
            vid = v.get("videoId")
            if vid and vid not in [x["id"] for x in videos]:
                videos.append({"id": vid, "title": runs_text(v.get("title")), "rel": runs_text(v.get("publishedTimeText"))})
        videos = videos[:MAX_VIDEOS]
        print(f"실시간 탭 최근 방송 {len(videos)}개")

        got = 0
        for v in videos:
            st = state["videos"].get(v["id"], {})
            if st.get("done"):
                continue
            first = st.get("first_seen") or now.isoformat()
            if (now - datetime.fromisoformat(first)).days > RETRY_DAYS:
                continue
            await page.goto(f"https://www.youtube.com/watch?v={v['id']}", wait_until="domcontentloaded")
            await page.wait_for_timeout(3500)
            pr = await page.evaluate("() => window.ytInitialPlayerResponse || null")
            if not pr:
                print(f"  {v['id']} 플레이어 정보 없음 — 다음에 재시도")
                state["videos"][v["id"]] = {"first_seen": first, "title": v["title"]}
                continue
            mf = (pr.get("microformat") or {}).get("playerMicroformatRenderer", {})
            lb = mf.get("liveBroadcastDetails") or {}
            if lb.get("isLiveNow"):
                print(f"  {v['title'][:40]} — 방송 중, 끝난 뒤 처리")
                state["videos"][v["id"]] = {"first_seen": first, "title": v["title"]}
                continue
            start_ts = lb.get("startTimestamp") or mf.get("publishDate") or ""
            tracks = ((pr.get("captions") or {}).get("playerCaptionsTracklistRenderer") or {}).get("captionTracks") or []
            tr = pick_track(tracks)
            if not tr:
                print(f"  {v['title'][:40]} — 한국어 자막 아직 없음(생성 대기, {RETRY_DAYS}일 재시도)")
                state["videos"][v["id"]] = {"first_seen": first, "title": v["title"], "no_captions": True}
                continue
            url = tr["baseUrl"] + ("&" if "?" in tr["baseUrl"] else "?") + "fmt=json3"
            resp = await page.request.get(url)
            if resp.status != 200:
                print(f"  {v['id']} 자막 요청 실패 {resp.status}")
                state["videos"][v["id"]] = {"first_seen": first, "title": v["title"]}
                continue
            segs = parse_json3(await resp.json())
            start_unix = int(datetime.fromisoformat(start_ts.replace("Z", "+00:00")).timestamp()) if start_ts else 0
            save(VOD / f"{v['id']}.json", {
                "videoId": v["id"], "title": v["title"], "startTimestamp": start_ts, "startUnix": start_unix,
                "trackKind": tr.get("kind", "manual"), "segments": segs, "collected_at": now.isoformat(),
            })
            state["videos"][v["id"]] = {"first_seen": first, "title": v["title"], "done": True, "segments": len(segs), "start": start_ts}
            got += 1
            print(f"  ✅ {v['title'][:40]} — 자막 {len(segs)}구간, 시작 {start_ts or '미상'}")
        try:
            await ctx.close()
        except Exception:
            pass
    save(STATE, state)
    print(f"새로 받은 방송 자막 {got}개 → {VOD}")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("중단")
    except Exception as exc:
        print(f"\n✖ 오류: {type(exc).__name__}: {exc}")

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


# ── 실시간 탭 영상 목록: (1) ytInitialData 의 videoRenderer / lockupViewModel(신형) (2) 화면 DOM (3) HTML 안의 videoId ──
JS_LIST_DOM = r"""
() => {
  const out = [];
  const seen = new Set();
  for (const el of document.querySelectorAll('ytd-rich-item-renderer, ytd-grid-video-renderer, yt-lockup-view-model')) {
    const a = el.querySelector('a[href*="watch?v="]');
    const m = a && a.getAttribute('href').match(/[?&]v=([\w-]{11})/);
    if (!m || seen.has(m[1])) continue;
    seen.add(m[1]);
    const title = (el.querySelector('#video-title, h3, .yt-lockup-metadata-view-model__title')?.innerText || '').trim();
    const meta = (el.querySelector('#metadata-line, .yt-content-metadata-view-model')?.innerText || '').replace(/\s+/g, ' ').trim();
    out.push({ id: m[1], title, rel: meta });
  }
  return out;
}
"""


async def list_streams(page):
    videos, seen = [], set()

    def add(vid, title, rel):
        if vid and vid not in seen:
            seen.add(vid)
            videos.append({"id": vid, "title": title or "", "rel": rel or ""})

    data = await page.evaluate("() => (window.ytInitialData || (typeof ytInitialData !== 'undefined' ? ytInitialData : null))")
    if data:
        for v in walk(data, "videoRenderer"):
            add(v.get("videoId"), runs_text(v.get("title")), runs_text(v.get("publishedTimeText")))
        for v in walk(data, "lockupViewModel"):
            if "VIDEO" not in str(v.get("contentType", "VIDEO")):
                continue
            md = ((v.get("metadata") or {}).get("lockupMetadataViewModel") or {})
            title = ((md.get("title") or {}).get("content")) or ""
            parts = []
            for row in walk(md, "metadataParts"):
                for part in row if isinstance(row, list) else []:
                    t = part.get("text") if isinstance(part, dict) else None
                    if isinstance(t, dict) and t.get("content"):
                        parts.append(t["content"])
            rel = " ".join(parts)
            add(v.get("contentId"), title, rel)
    if not videos:
        try:
            for v in await page.evaluate(JS_LIST_DOM):
                add(v["id"], v["title"], v["rel"])
        except Exception:
            pass
    if not videos:
        for m in re.finditer(r'"videoId":"([\w-]{11})"', await page.content()):
            add(m.group(1), "", "")
    return videos


async def player_response(page):
    pr = await page.evaluate("() => (window.ytInitialPlayerResponse || (typeof ytInitialPlayerResponse !== 'undefined' ? ytInitialPlayerResponse : null))")
    if pr:
        return pr
    html = await page.content()
    m = re.search(r"ytInitialPlayerResponse\s*=\s*(\{.*?\})\s*;\s*(?:var|</script>)", html, re.S)
    if m:
        try:
            return json.loads(m.group(1))
        except Exception:
            pass
    # 최소한 자막·시작 시각만이라도
    ct = re.search(r'"captionTracks":(\[.*?\])', html)
    st = re.search(r'"startTimestamp":"([^"]+)"', html)
    if ct:
        try:
            return {"captions": {"playerCaptionsTracklistRenderer": {"captionTracks": json.loads(ct.group(1))}},
                    "microformat": {"playerMicroformatRenderer": {"liveBroadcastDetails": {"startTimestamp": st.group(1) if st else "", "isLiveNow": '"isLiveNow":true' in html}}}}
        except Exception:
            pass
    return None



def parse_xml_captions(xml):
    import html as _html
    segs = []
    for m in re.finditer(r'<text start="([\d.]+)"(?: dur="([\d.]+)")?[^>]*>(.*?)</text>', xml, re.S):
        text = _html.unescape(re.sub(r"<[^>]+>", "", m.group(3))).replace("\n", " ").strip()
        if text:
            segs.append({"t": round(float(m.group(1)), 1), "d": round(float(m.group(2) or 0), 1), "text": text})
    return segs


JS_TRANSCRIPT = r"""
() => [...document.querySelectorAll('ytd-transcript-segment-renderer')].map(el => ({
  ts: (el.querySelector('.segment-timestamp')?.innerText || '').trim(),
  text: (el.querySelector('.segment-text, yt-formatted-string.segment-text')?.innerText || '').replace(/\s+/g, ' ').trim(),
}))
"""


def hms(ts):
    parts = [int(x) for x in ts.split(":") if x.strip().isdigit()]
    sec = 0
    for x in parts:
        sec = sec * 60 + x
    return sec


async def transcript_panel(page):
    """재생 페이지의 '스크립트 표시' 패널에서 자막을 읽는다(타임텍스트 요청이 막혔을 때)."""
    try:
        exp = page.locator("#description #expand, tp-yt-paper-button#expand, #expand").first
        if await exp.count():
            await exp.click(timeout=5000)
            await page.wait_for_timeout(800)
    except Exception:
        pass
    btn = page.get_by_role("button", name=re.compile("스크립트|Transcript|자막 텍스트")).first
    if await btn.count() == 0:
        btn = page.locator("ytd-video-description-transcript-section-renderer button").first
    if await btn.count() == 0:
        return []
    await btn.click(timeout=8000)
    for _ in range(20):
        await page.wait_for_timeout(1000)
        rows = await page.evaluate(JS_TRANSCRIPT)
        if len(rows) > 5:
            segs = [{"t": float(hms(r["ts"])), "d": 0.0, "text": r["text"]} for r in rows if r["text"]]
            return segs
    return []


async def fetch_captions(page, tr):
    """자막 구간 목록과 방식 이름을 돌려준다. 실패하면 ([], 이유)."""
    base = tr.get("baseUrl") or ""
    if base:
        url = base + ("&" if "?" in base else "?") + "fmt=json3"
        try:
            resp = await page.request.get(url)
            txt = (await resp.text()).strip() if resp.status == 200 else ""
            if txt.startswith("{"):
                segs = parse_json3(json.loads(txt))
                if segs:
                    return segs, "json3"
            if txt.startswith("<"):
                segs = parse_xml_captions(txt)
                if segs:
                    return segs, "xml"
            reason = f"timedtext {resp.status} 빈 응답"
        except Exception as exc:
            reason = f"timedtext {type(exc).__name__}"
    else:
        reason = "baseUrl 없음"
    try:
        segs = await transcript_panel(page)
        if segs:
            return segs, "panel"
    except Exception as exc:
        reason += f" / panel {type(exc).__name__}"
    return [], reason



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
        videos = await list_streams(page)
        videos = videos[:MAX_VIDEOS]
        print(f"실시간 탭 최근 방송 {len(videos)}개")
        if not videos:
            print("⚠ 실시간 탭에서 영상을 못 읽었습니다(로그인 풀림 또는 화면 구조 변경). 브라우저 화면을 캡처해 주세요.")

        got = 0
        for v in videos:
          try:
            st = state["videos"].get(v["id"], {})
            if st.get("done"):
                continue
            first = st.get("first_seen") or now.isoformat()
            if (now - datetime.fromisoformat(first)).days > RETRY_DAYS:
                continue
            await page.goto(f"https://www.youtube.com/watch?v={v['id']}", wait_until="domcontentloaded")
            await page.wait_for_timeout(3500)
            pr = await player_response(page)
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
            segs, how = await fetch_captions(page, tr)
            if not segs:
                print(f"  {v['title'][:40]} — 자막 내용을 받지 못함({how}), 다음에 재시도")
                state["videos"][v["id"]] = {"first_seen": first, "title": v["title"], "fetch_fail": how}
                continue
            start_unix = int(datetime.fromisoformat(start_ts.replace("Z", "+00:00")).timestamp()) if start_ts else 0
            save(VOD / f"{v['id']}.json", {
                "videoId": v["id"], "title": v["title"], "startTimestamp": start_ts, "startUnix": start_unix,
                "trackKind": tr.get("kind", "manual"), "how": how, "segments": segs, "collected_at": now.isoformat(),
            })
            state["videos"][v["id"]] = {"first_seen": first, "title": v["title"], "done": True, "segments": len(segs), "start": start_ts}
            got += 1
            print(f"  ✅ {v['title'][:40]} — 자막 {len(segs)}구간, 시작 {start_ts or '미상'} ({how})")
          except Exception as exc:
            print(f"  {v.get('title', v['id'])[:40]} — 처리 오류 {type(exc).__name__}: {str(exc)[:120]} (다음에 재시도)")
            save(STATE, state)
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

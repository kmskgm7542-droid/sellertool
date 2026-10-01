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
from yt_login import check_and_alert  # noqa: E402

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


def hms(ts):
    parts = [int(x) for x in ts.split(":") if x.strip().isdigit()]
    sec = 0
    for x in parts:
        sec = sec * 60 + x
    return sec


def parse_innertube_transcript(j):
    segs = []
    for r in walk(j, "transcriptSegmentRenderer"):
        text = "".join(x.get("text", "") for x in (r.get("snippet") or {}).get("runs", [])).replace("\n", " ").strip()
        if text and "startMs" in r:
            segs.append({"t": round(int(r["startMs"]) / 1000, 1), "d": round((int(r.get("endMs", r["startMs"])) - int(r["startMs"])) / 1000, 1), "text": text})
    return segs


def transcript_params(video_id):
    import base64
    return base64.b64encode(b"\n\x0b" + video_id.encode()).decode()


# 화면에 열린 스크립트 패널의 줄들
JS_TRANSCRIPT_DOM = r"""
() => {
  // 시각 표시 줄: "3:57", "1:03:57", 그리고 화면 낭독용 "3분 57초", "1시간 3분 57초" — 이런 줄은 문장이 아니다
  const isClock = (s) => /^\d{1,2}:\d{2}(:\d{2})?$/.test(s);
  const isSpokenTime = (s) => /^(\d+\s*시간\s*)?(\d+\s*분\s*)?(\d+\s*초)?$/.test(s) && /\d/.test(s);
  const isTime = (s) => isClock(s) || isSpokenTime(s);
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const segs = [...document.querySelectorAll('ytd-transcript-segment-renderer')].map(el => {
    const ts = clean(el.querySelector('.segment-timestamp')?.innerText);
    let text = clean(el.querySelector('.segment-text, yt-formatted-string.segment-text')?.innerText);
    if (!text || isTime(text)) {
      // 요소 전체 글에서 시각 줄을 걷어낸 나머지가 문장
      text = (el.innerText || '').split('\n').map(clean).filter(l => l && !isTime(l)).join(' ');
    }
    return { ts, text };
  }).filter(s => s.ts && s.text && !isTime(s.text));
  if (segs.length > 5) return segs;
  // 대체: 스크립트 패널 영역의 텍스트를 줄 단위로 읽어 "시각 줄 → (낭독 시각 줄 건너뛰고) 문장 줄" 쌍으로 만든다
  const panel = [...document.querySelectorAll('ytd-engagement-panel-section-list-renderer')]
    .find(p => /transcript|스크립트/i.test(p.getAttribute('target-id') || '') || /스크립트/.test(p.innerText.slice(0, 200)));
  if (!panel) return [];
  const lines = panel.innerText.split('\n').map(clean).filter(Boolean);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (!isClock(lines[i])) continue;
    let j = i + 1;
    while (j < lines.length && isSpokenTime(lines[j])) j++;
    if (j < lines.length && !isTime(lines[j])) {
      out.push({ ts: lines[i], text: lines[j] });
      i = j;
    }
  }
  return out;
}
"""


def looks_like_time(text):
    """'3분 57초', '1:03:57' 처럼 시각 표시만 있는 줄인지"""
    t = (text or "").strip()
    return bool(re.fullmatch(r"\d{1,2}:\d{2}(:\d{2})?", t) or (re.fullmatch(r"(\d+\s*시간\s*)?(\d+\s*분\s*)?(\d+\s*초)?", t) and re.search(r"\d", t)))


def segments_are_garbage(segs):
    """자막이 문장이 아니라 시각 표시로만 채워졌는지(화면 읽기 경로가 잘못 긁은 경우)"""
    if not segs:
        return True
    bad = sum(1 for s in segs if looks_like_time(s.get("text", "")))
    return bad * 2 > len(segs)

# 페이지 안에서 유튜브 내부 API(get_transcript)를 패널과 같은 방식으로 호출
JS_INNERTUBE = r"""
async ({ params }) => {
  const get = (k) => (window.ytcfg && ytcfg.get) ? ytcfg.get(k) : null;
  const key = get('INNERTUBE_API_KEY');
  const ctx = get('INNERTUBE_CONTEXT');
  if (!key || !ctx) return { error: 'ytcfg 없음' };
  const headers = {
    'Content-Type': 'application/json',
    'X-Youtube-Client-Name': String(get('INNERTUBE_CONTEXT_CLIENT_NAME') || 1),
    'X-Youtube-Client-Version': get('INNERTUBE_CLIENT_VERSION') || '',
    'X-Goog-AuthUser': String(get('SESSION_INDEX') || 0),
    'X-Origin': 'https://www.youtube.com',
  };
  const vd = get('VISITOR_DATA'); if (vd) headers['X-Goog-Visitor-Id'] = vd;
  const m = document.cookie.match(/(?:^|;\s*)(?:SAPISID|__Secure-3PAPISID)=([^;]+)/);
  if (m) {
    const ts = Math.floor(Date.now() / 1000);
    const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(`${ts} ${m[1]} https://www.youtube.com`));
    const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    headers['Authorization'] = `SAPISIDHASH ${ts}_${hex}`;
  }
  const r = await fetch(`/youtubei/v1/get_transcript?prettyPrint=false`, {
    method: 'POST', credentials: 'include', headers, body: JSON.stringify({ context: ctx, params }),
  });
  let j = null; try { j = await r.json(); } catch (e) { return { error: `status ${r.status}` }; }
  if (!r.ok) return { error: `status ${r.status} ${(j && j.error && j.error.message) || ''}` };
  return j;
}
"""

# 화면에서 '스크립트 표시' 버튼 후보를 찾아 누른다(설명란 → '...' 메뉴 순서)
JS_CLICK_TRANSCRIPT = r"""
() => {
  const vis = (el) => el && el.offsetParent !== null;
  const txt = (el) => ((el.getAttribute('aria-label') || '') + ' ' + (el.innerText || '')).trim();
  const all = [...document.querySelectorAll('button, yt-button-shape button, a')].filter(vis);
  // 이미 열려 있으면('스크립트 닫기' 보임) 건드리지 않는다 — 누르면 닫힌다
  if (all.some((el) => /스크립트 닫기|hide transcript/i.test(txt(el)))) return 'already-open';
  for (const sel of ['#description-inline-expander #expand', 'tp-yt-paper-button#expand', '#expand']) {
    const e = document.querySelector(sel);
    if (vis(e)) { e.click(); break; }
  }
  const cands = [...document.querySelectorAll('ytd-video-description-transcript-section-renderer button, ytd-video-description-transcript-section-renderer yt-button-shape button, button, yt-button-shape button, a')]
    .filter((el) => vis(el) && /스크립트 표시|show transcript/i.test(txt(el)));
  if (cands.length) { cands[0].click(); return 'description-button'; }
  return '';
}
"""

JS_CLICK_MENU_TRANSCRIPT = r"""
() => {
  const vis = (el) => el && el.offsetParent !== null;
  const items = [...document.querySelectorAll('ytd-menu-service-item-renderer, tp-yt-paper-item, yt-list-item-view-model, [role=menuitem]')]
    .filter((el) => vis(el) && /스크립트|transcript/i.test(el.innerText || ''));
  if (items.length) { items[0].click(); return 'menu-item'; }
  return '';
}
"""

JS_DIAG_BUTTONS = r"""
() => [...document.querySelectorAll('button, a, yt-button-shape, ytd-menu-service-item-renderer')]
  .map((el) => ((el.getAttribute('aria-label') || '') + '|' + (el.innerText || '').replace(/\s+/g, ' ').slice(0, 40)))
  .filter((t) => /스크립트|transcript|자막|더보기|추가 작업/i.test(t)).slice(0, 40)
"""

DIAG = DATA / "diag"


async def fetch_captions(page, tr, video_id, captured=None):
    """자막 구간과 방식을 돌려준다. 순서: timedtext → 내부 API(페이지 params) → 화면 패널(네트워크 응답 가로채기 + DOM). 전부 실패하면 진단 파일을 남긴다."""
    reasons = []
    if captured is None:
        captured = []
        page.on("response", lambda r: captured.append(r) if ("get_transcript" in r.url or "timedtext" in r.url) else None)

    # A) 자막 주소 직접 요청
    base = (tr or {}).get("baseUrl") or ""
    if base:
        try:
            resp = await page.request.get(base + ("&" if "?" in base else "?") + "fmt=json3")
            txt = (await resp.text()).strip() if resp.status == 200 else ""
            if txt.startswith("{"):
                segs = parse_json3(json.loads(txt))
                if segs:
                    return segs, "json3"
            if txt.startswith("<"):
                segs = parse_xml_captions(txt)
                if segs:
                    return segs, "xml"
            reasons.append(f"timedtext {resp.status} 빈 응답")
        except Exception as exc:
            reasons.append(f"timedtext {type(exc).__name__}")

    # B) 내부 API — 패널이 쓰는 params 를 페이지에서 꺼낸다
    params_list = []
    try:
        data = await page.evaluate("() => (window.ytInitialData || (typeof ytInitialData !== 'undefined' ? ytInitialData : null))")
        from urllib.parse import unquote
        for ep in walk(data or {}, "getTranscriptEndpoint"):
            if isinstance(ep, dict) and ep.get("params"):
                # 페이지에는 URL 인코딩("%3D")된 채로 들어 있다 → 풀어서 보내야 400(Precondition) 이 안 난다
                pv = unquote(ep["params"])
                if pv not in params_list:
                    params_list.append(pv)
        if not params_list:
            for m in re.finditer(r'"getTranscriptEndpoint":\{"params":"([^"]+)"', await page.content()):
                pv = unquote(m.group(1))
                if pv not in params_list:
                    params_list.append(pv)
    except Exception as exc:
        reasons.append(f"params {type(exc).__name__}")
    params_list.append(transcript_params(video_id))
    last = ""
    for params in params_list:
        try:
            j = await page.evaluate(JS_INNERTUBE, {"params": params})
            if isinstance(j, dict) and not j.get("error"):
                segs = parse_innertube_transcript(j)
                if segs:
                    return segs, "innertube"
                last = "빈 결과"
            else:
                last = str((j or {}).get("error", "?"))[:60]
        except Exception as exc:
            last = type(exc).__name__
    reasons.append(f"innertube {last} (params {len(params_list)})")

    # C) 화면 패널 열기 → 네트워크 응답 가로채기 → DOM 읽기
    how_clicked = ""
    try:
        await page.wait_for_timeout(2000)
        await page.mouse.wheel(0, 300)
        await page.wait_for_timeout(800)
        # 로드 시 이미 나간 요청(패널이 열린 채 이동)부터 확인
        for r in list(captured):
            if "get_transcript" in r.url and r.ok:
                try:
                    segs = parse_innertube_transcript(await r.json())
                    if segs:
                        return segs, "panel-response(preload)"
                except Exception:
                    pass
        how_clicked = await page.evaluate(JS_CLICK_TRANSCRIPT)
        if not how_clicked:
            await page.wait_for_timeout(1500)
            how_clicked = await page.evaluate(JS_CLICK_TRANSCRIPT)
        if not how_clicked:
            more = page.locator('ytd-watch-metadata button[aria-label="추가 작업"], ytd-watch-metadata ytd-menu-renderer yt-button-shape button').last
            if await more.count():
                await more.click(timeout=5000)
                await page.wait_for_timeout(800)
                how_clicked = await page.evaluate(JS_CLICK_MENU_TRANSCRIPT)
        if how_clicked:
            dom_rows = []
            for i in range(20):
                await page.wait_for_timeout(1000)
                for r in list(captured):
                    if "get_transcript" in r.url and r.ok:
                        try:
                            segs = parse_innertube_transcript(await r.json())
                            if segs:
                                return segs, f"panel-response({how_clicked})"
                        except Exception:
                            pass
                # 네트워크 응답이 몇 초 안에 안 오면 화면의 줄을 읽는다(시각 표시만 긁힌 결과는 버린다)
                if i >= 4:
                    rows = await page.evaluate(JS_TRANSCRIPT_DOM)
                    segs = [{"t": float(hms(r["ts"])), "d": 0.0, "text": r["text"]} for r in rows if r.get("text")]
                    if len(segs) > 5 and not segments_are_garbage(segs):
                        return segs, f"panel-dom({how_clicked})"
                    dom_rows = rows
            reasons.append(f"panel 열림({how_clicked}) 그러나 문장 줄 없음(화면 줄 {len(dom_rows)}개)")
        else:
            reasons.append("panel 버튼 못 찾음")
    except Exception as exc:
        reasons.append(f"panel {type(exc).__name__}: {str(exc)[:60]}")

    # D) 진단 파일(무엇이 화면에 있었는지) — 드라이브로 올라가 김이사가 정확히 고칠 수 있게
    try:
        DIAG.mkdir(exist_ok=True)
        (DIAG / f"{video_id}.html").write_text(await page.content(), "utf-8")
        await page.screenshot(path=str(DIAG / f"{video_id}.png"), full_page=False)
        info = {"reasons": reasons, "buttons": await page.evaluate(JS_DIAG_BUTTONS), "captured": [r.url[:120] for r in captured], "params": params_list[:3]}
        (DIAG / f"{video_id}_diag.json").write_text(json.dumps(info, ensure_ascii=False, indent=1), "utf-8")
        reasons.append("진단 저장")
    except Exception:
        pass
    return [], " / ".join(reasons)


def purge_bad_vods(state):
    """예전 버전이 시각 표시만 긁어 저장한 자막 파일을 지우고, 다음 실행에서 다시 받게 한다.
    추출 상태(extract_state.json)에서도 빼서 규칙 추출이 다시 돌게 한다."""
    extract_state_path = DATA / "extract_state.json"
    ex = load(extract_state_path, {"videos": {}})
    purged = 0
    for f in sorted(VOD.glob("*.json")):
        try:
            v = load(f, {})
        except Exception:
            continue
        if segments_are_garbage(v.get("segments") or []):
            vid = v.get("videoId") or f.stem
            f.unlink(missing_ok=True)
            st = state["videos"].get(vid)
            if st:
                st.pop("done", None)
                st.pop("segments", None)
                st["first_seen"] = datetime.now(timezone.utc).isoformat()
                st["refetch"] = "시각 표시만 저장됨"
            ex.get("videos", {}).pop(vid, None)
            purged += 1
            print(f"  ↻ {v.get('title', vid)[:40]} — 자막이 시각 표시만 들어 있어 다시 받습니다")
    if purged:
        save(extract_state_path, ex)
        save(STATE, state)


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
    purge_bad_vods(state)

    async with async_playwright() as pw:
        ctx = await pw.chromium.launch_persistent_context(
            str(PROFILE), headless=False, locale="ko-KR", viewport={"width": 1200, "height": 900},
            args=["--disable-blink-features=AutomationControlled"],
        )
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        await page.goto(base + "/streams", wait_until="domcontentloaded")
        await page.wait_for_timeout(1500)
        await check_and_alert(page, DATA, "방송 자막 수집")  # 로그인이 풀렸으면 텔레그램으로 하루 한 번 알림
        await page.wait_for_timeout(3000)
        videos = await list_streams(page)
        videos = videos[:MAX_VIDEOS]
        print(f"실시간 탭 최근 방송 {len(videos)}개")
        if not videos:
            print("⚠ 실시간 탭에서 영상을 못 읽었습니다(로그인 풀림 또는 화면 구조 변경). 브라우저 화면을 캡처해 주세요.")

        got = 0
        captured = []
        page.on("response", lambda r: captured.append(r) if ("get_transcript" in r.url or "timedtext" in r.url) else None)
        for v in videos:
          try:
            captured.clear()
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
            segs, how = await fetch_captions(page, tr, v['id'], captured)
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

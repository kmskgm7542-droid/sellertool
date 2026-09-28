"""
유튜브 채널 게시판(회원 전용 포함) 수집기 — 대표 PC에서 실행.

  실행: yt_posts.bat (또는 python yt_posts.py)
  첫 실행: 브라우저 창이 열리면 유튜브에 **멤버십 계정으로 로그인** 후 창의 안내에 따라 Enter.
           로그인은 data/yt_profile 에 저장되어 다음부터는 묻지 않는다.
  결과: data/yt_result.json — 텔레그램 내보내기와 같은 형식(messages[]) + 게시글 상세.
        → node run.mjs parse data/yt_result.json

  게시글 시각: 유튜브는 "5일 전" 같은 상대 시각만 보여준다. 수집 시각에서 역산해 저장하고
  정밀도(분/시간/일/주/개월)를 함께 기록한다. 매일 실행하면 하루 이내 정밀도가 유지된다.
  data/ 폴더는 .gitignore 대상. 본인 검증용. 재배포·상품화 금지.
"""
import asyncio
import json
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    from playwright.async_api import async_playwright
except ImportError:
    print("playwright 가 없습니다. yt_posts.bat 으로 실행하세요.")
    sys.exit(1)

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
CFG = DATA / "yt_config.json"
OUT = DATA / "yt_result.json"
PROFILE = DATA / "yt_profile"
KST = timezone(timedelta(hours=9))
MAX_SCROLL = 60  # 한 번에 최대 스크롤 횟수(게시글 약 300개)


def load(p, default):
    return json.loads(p.read_text("utf-8")) if p.exists() else default


def save(p, obj):
    p.write_text(json.dumps(obj, ensure_ascii=False, indent=1), "utf-8")


REL = [
    (r"(\d+)\s*(분|minute)", "minute", 60),
    (r"(\d+)\s*(시간|hour)", "hour", 3600),
    (r"(\d+)\s*(일|day)", "day", 86400),
    (r"(\d+)\s*(주|week)", "week", 7 * 86400),
    (r"(\d+)\s*(개월|month)", "month", 30 * 86400),
    (r"(\d+)\s*(년|year)", "year", 365 * 86400),
]


def relative_to_abs(text, now):
    """'5일 전' → (추정 시각, 정밀도). 해석 불가면 (None, 'unknown')."""
    t = (text or "").strip()
    if re.search(r"방금|just now", t):
        return now, "minute"
    for pat, unit, sec in REL:
        m = re.search(pat, t)
        if m:
            return now - timedelta(seconds=int(m.group(1)) * sec), unit
    return None, "unknown"


JS_EXTRACT = r"""
() => {
  const posts = [...document.querySelectorAll('ytd-backstage-post-renderer')];
  return posts.map(p => {
    const q = (s) => p.querySelector(s);
    const text = q('#content-text')?.innerText ?? q('#content')?.innerText ?? '';
    const timeEl = q('#published-time-text a') || q('#published-time-text') || q('a[href*="/post/"]');
    const rel = timeEl?.innerText ?? '';
    const link = [...p.querySelectorAll('a[href*="/post/"]')].map(a => a.getAttribute('href')).find(Boolean) || '';
    const id = (link.match(/\/post\/([^/?#]+)/) || [])[1] || '';
    const imgs = [...p.querySelectorAll('#backstage-image img, ytd-backstage-image-renderer img, img#img')]
      .map(i => i.src).filter(s => s && s.startsWith('http'));
    const badge = [...p.querySelectorAll('ytd-badge-supported-renderer, .badge')].map(b => b.innerText).join(' ');
    return { id, link, text, rel, imgs, membersOnly: /회원|member/i.test(badge) };
  });
}
"""

JS_EXPAND = r"""
() => {
  let n = 0;
  for (const b of document.querySelectorAll('ytd-backstage-post-renderer #more, ytd-backstage-post-renderer tp-yt-paper-button#more, ytd-backstage-post-renderer [id="more"]')) {
    if (b.offsetParent !== null) { b.click(); n++; }
  }
  return n;
}
"""


async def main():
    DATA.mkdir(exist_ok=True)
    cfg = load(CFG, {})
    if not cfg.get("channel_url"):
        print("유튜브 채널 주소를 입력하세요. 예: https://www.youtube.com/@생존투자")
        print("(채널 페이지 주소창의 주소를 그대로 붙여넣기. 붙여넣기는 마우스 오른쪽 클릭)")
        cfg["channel_url"] = input("채널 주소: ").strip().rstrip("/")
        save(CFG, cfg)
    base = re.sub(r"/(posts|community|videos|streams|featured)$", "", cfg["channel_url"])
    url = base + "/posts"

    existing = load(OUT, {"name": "youtube-posts", "messages": []})
    known = {m["post_id"]: m for m in existing["messages"] if m.get("post_id")}

    posts = []
    async with async_playwright() as pw:
        async def open_page():
            ctx = await pw.chromium.launch_persistent_context(
                str(PROFILE), headless=False, locale="ko-KR", viewport={"width": 1200, "height": 900},
                args=["--disable-blink-features=AutomationControlled"],
            )
            page = ctx.pages[0] if ctx.pages else await ctx.new_page()
            await page.goto(url, wait_until="domcontentloaded")
            await page.wait_for_timeout(3000)
            return ctx, page

        ctx, page = await open_page()

        if not cfg.get("logged_in"):
            print("\n브라우저 창에서 유튜브에 로그인하세요 (멤버십 가입된 구글 계정).")
            print("★ 브라우저 창은 닫지 마세요. 로그인이 끝나면 이 검은 창으로 돌아와 Enter 만 누르세요.")
            input()
            cfg["logged_in"] = True
            save(CFG, cfg)
            if page.is_closed() or not ctx.pages:
                print("브라우저가 닫혀 있어 다시 엽니다...")
                ctx, page = await open_page()
            else:
                await page.goto(url, wait_until="domcontentloaded")
                await page.wait_for_timeout(3000)

        now = datetime.now(KST)
        seen_new = 0
        stale_rounds = 0
        last_count = 0
        try:
            for i in range(MAX_SCROLL):
                await page.evaluate(JS_EXPAND)
                posts = await page.evaluate(JS_EXTRACT)
                ids = [p["id"] for p in posts if p["id"]]
                print(f"  스크롤 {i + 1}: 게시글 {len(ids)}개 로드", end="\r")
                if len(ids) == last_count:
                    stale_rounds += 1
                else:
                    stale_rounds = 0
                last_count = len(ids)
                # 이미 아는 글까지 내려왔고 새 글이 없으면(증분) 중단
                if known and ids and all(pid in known for pid in ids[-5:]) and i >= 2:
                    break
                if stale_rounds >= 3:
                    break
                await page.mouse.wheel(0, 4000)
                await page.wait_for_timeout(1500)
            await page.evaluate(JS_EXPAND)
            await page.wait_for_timeout(500)
            posts = await page.evaluate(JS_EXTRACT)
        except Exception as exc:  # 창이 닫히는 등 — 그때까지 모은 것으로 저장
            print(f"\n⚠ 수집 중 중단됨: {type(exc).__name__}: {str(exc)[:150]}")
        print()
        if not posts:
            print("⚠ 게시글을 하나도 읽지 못했습니다. 로그인이 풀렸거나 게시판 화면 구조가 다를 수 있습니다.")
            print("  브라우저 화면과 이 창을 캡처해서 김이사에게 보내주세요.")

        for p in posts:
            if not p["id"] or not p["text"].strip():
                continue
            est, prec = relative_to_abs(p["rel"], now)
            rec = known.get(p["id"])
            if rec is None:
                seen_new += 1
                rec = {"type": "message", "id": len(known) + 1, "post_id": p["id"], "channel": "유튜브 게시판"}
                known[p["id"]] = rec
                # 처음 본 시점의 추정치가 가장 정확하다 — 이후 갱신하지 않는다
                rec["date"] = est.isoformat() if est else ""
                rec["date_unixtime"] = int(est.timestamp()) if est else 0
                rec["date_precision"] = prec
                rec["published_relative"] = p["rel"]
                rec["collected_at"] = now.isoformat()
            rec["text"] = p["text"]
            rec["url"] = "https://www.youtube.com" + p["link"] if p["link"].startswith("/") else p["link"]
            rec["images"] = p["imgs"]
            rec["members_only"] = p["membersOnly"]

        try:
            await ctx.close()
        except Exception:
            pass

    msgs = sorted(known.values(), key=lambda m: (m.get("date_unixtime", 0), m["id"]))
    save(OUT, {"name": "youtube-posts", "channel_url": cfg["channel_url"], "messages": msgs})
    coarse = sum(1 for m in msgs if m.get("date_precision") in ("week", "month", "year", "unknown"))
    print(f"\n게시글 {len(msgs)}건 (신규 {seen_new}) → {OUT}")
    print(f"시각 정밀도: 하루 이내 {len(msgs) - coarse}건 / 주 단위 이상(부정확) {coarse}건")
    print("다음: yt_result.json 을 김이사에게 업로드. 매일 한 번 실행하면 새 글이 정확한 날짜로 쌓입니다.")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("중단")
    except Exception as exc:
        print(f"\n✖ 오류: {type(exc).__name__}: {exc}")
        print("이 창을 캡처해서 김이사에게 보내주세요.")

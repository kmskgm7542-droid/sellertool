"""김이사 대행 수신함 — 드라이브 'call-verify-inbox' 폴더의 명령 파일(inbox_*.txt)을 받아 data/inbox/ 에 둔다(대표 승인 2026-11-25).
  처리는 inbox.mjs 가 한다(봇 명령과 같은 규칙: 콜 기록·소급·취소·관심종목·별칭). 받은 파일은 data/inbox_done.json 에 기록해 다시 받지 않는다.
  드라이브 데스크톱이 있으면 그 폴더에서 바로 복사, 없으면 유튜브·드라이브 업로드와 같은 로그인 프로필(data/yt_profile)의 브라우저로 내려받는다.
  실행: python drive_inbox.py   (vod_run 18:30·daily_run 21:30 이 부른다)
"""
import asyncio
import json
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
INBOX = DATA / "inbox"
DONE = DATA / "inbox_done.json"
INBOX_FOLDER_ID = "1UHijq3unYkgtgaKi-7op-p5B7EYPNO22"  # 대표 드라이브 > call-verify-sync > call-verify-inbox
PROFILE = DATA / "yt_profile"
sys.path.insert(0, str(HERE))


def load_done():
    try:
        return set(json.loads(DONE.read_text("utf-8")))
    except Exception:
        return set()


def from_desktop(done):
    from export_drive import find_drive_root
    root = find_drive_root()
    src = root / "call-verify-sync" / "call-verify-inbox" if root else None
    if not src or not src.is_dir():
        return None
    got = []
    for f in sorted(src.glob("inbox_*.txt")):
        if f.name in done:
            continue
        shutil.copy2(f, INBOX / f.name)
        got.append(f.name)
    return got


async def from_web(done):
    from playwright.async_api import async_playwright
    got = []
    async with async_playwright() as pw:
        ctx = await pw.chromium.launch_persistent_context(
            str(PROFILE), headless=False, locale="ko-KR", viewport={"width": 1200, "height": 900},
            args=["--disable-blink-features=AutomationControlled"],
        )
        try:
            page = ctx.pages[0] if ctx.pages else await ctx.new_page()
            try:
                await page.goto(f"https://drive.google.com/drive/folders/{INBOX_FOLDER_ID}", wait_until="domcontentloaded")
            except Exception:
                pass
            await page.wait_for_timeout(6000)
            if "accounts.google.com" in page.url:
                print("✖ 수신함: 구글 로그인이 풀려 있습니다(yt_relogin.bat).")
                return None
            # 목록의 파일 행에는 data-id(드라이브 파일 ID)가 붙어 있다. 이름이 inbox_ 로 시작하는 것만.
            rows = await page.evaluate("""() => [...document.querySelectorAll('[data-id]')].map(e => ({
                id: e.getAttribute('data-id'), t: (e.getAttribute('aria-label') || '') + ' ' + (e.innerText || '') }))""")
            seen = {}
            for r in rows:
                import re
                m = re.search(r"inbox_[^\s/\\\"']+?\.txt", r["t"] or "")  # 행 텍스트·aria-label 어디든 파일명이 있으면
                name = m.group(0) if m else None
                if name and r["id"] and len(r["id"]) > 15:
                    seen[name] = r["id"]
            for name, fid in sorted(seen.items()):
                if name in done:
                    continue
                resp = await ctx.request.get(f"https://drive.google.com/uc?export=download&id={fid}")
                body = await resp.body()
                text = body.decode("utf-8", "replace")
                if resp.status != 200 or text.lstrip().startswith("<"):
                    print(f"  {name}: 내려받기 실패(HTTP {resp.status})")
                    continue
                (INBOX / name).write_text(text, "utf-8")
                got.append(name)
            print(f"수신함 목록 {len(seen)}개 확인")
        finally:
            await ctx.close()
    return got


def main():
    INBOX.mkdir(parents=True, exist_ok=True)
    done = load_done()
    got = from_desktop(done)
    if got is None:
        got = asyncio.run(from_web(done))
    if got is None:
        sys.exit(1)
    DONE.write_text(json.dumps(sorted(done | set(got)), ensure_ascii=False), "utf-8")
    print(f"수신함 새 명령 파일 {len(got)}개{': ' + ', '.join(got) if got else ''}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"✖ 수신함 오류: {type(exc).__name__}: {exc}")
        sys.exit(1)

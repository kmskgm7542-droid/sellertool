"""유튜브·구글 다시 로그인 — 로그인이 풀렸을 때 대표가 직접 실행한다(yt_relogin.bat).
  게시판 수집(yt_posts)·방송 자막(yt_live)·드라이브 업로드(drive_upload)는 모두 같은 브라우저 프로필(data/yt_profile)을 쓴다.
  여기서 한 번 로그인하면 셋 다 다시 동작한다. 로그인 후 유튜브(멤버십 표시)와 드라이브 폴더 접근을 차례로 확인한다.
  ※ 자동 실행 시간(평일 14:40~16:50, 매일 18:30·21:30, 일 22:00)에는 실행하지 않는다 — 같은 프로필을 두 프로그램이 동시에 열면 로그인 정보가 깨질 수 있다.
"""
import asyncio
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
PROFILE = DATA / "yt_profile"
sys.path.insert(0, str(HERE))
from yt_login import login_state  # noqa: E402

FOLDER_ID = "1y3fcTU5lVLusZEuFVbIENZrQoATdz62E"


async def safe_goto(page, url, wait=4000):
    """구글이 비밀번호 변경·본인 확인 화면으로 돌려보내면 이동이 '중단'되며 예외가 난다 → 무시하고 현재 화면을 쓴다."""
    try:
        await page.goto(url, wait_until="domcontentloaded")
    except Exception:
        pass
    await page.wait_for_timeout(wait)


def google_block(url: str) -> str:
    """구글이 로그인 대신 요구하는 화면이면 그 이름(한국어), 아니면 ''."""
    if "accounts.google.com" not in url:
        return ""
    if "changepassword" in url or "speedbump" in url:
        return "비밀번호 변경 요구(구글 보안 조치)"
    if "challenge" in url:
        return "본인 확인(2단계 인증) 요구"
    return "로그인 화면"


async def main():
    from playwright.async_api import async_playwright
    cfg = json.loads((DATA / "drive.json").read_text("utf-8")) if (DATA / "drive.json").exists() else {}
    folder = cfg.get("folder_id") or FOLDER_ID
    async with async_playwright() as pw:
        ctx = await pw.chromium.launch_persistent_context(
            str(PROFILE), headless=False, locale="ko-KR", viewport={"width": 1200, "height": 900},
            args=["--disable-blink-features=AutomationControlled"],
        )
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        await safe_goto(page, "https://www.youtube.com/")
        before = await login_state(page)
        print(f"현재 유튜브 로그인 상태: {'로그인됨' if before == 'in' else '풀림' if before == 'out' else '확인 불가'}")
        if before != "in":
            await safe_goto(page, "https://accounts.google.com/ServiceLogin?continue=https://www.youtube.com/", 2000)
        yt, drive_ok = "unknown", False
        for attempt in range(1, 4):
            print("\n브라우저 창에서 멤버십에 가입된 구글 계정으로 로그인하세요(이미 로그인돼 있으면 그대로 두세요).")
            print("  · 구글이 '비밀번호 변경'이나 '본인 확인'을 요구하면 그 화면에서 끝까지 마치세요.")
            print("★ 브라우저 창은 닫지 마세요. 끝나면 이 검은 창으로 돌아와 Enter 를 누르세요.")
            input()
            if page.is_closed():
                page = await ctx.new_page()
            block = google_block(page.url)
            if block and attempt < 3:
                print(f"\n아직 구글 화면에 있습니다: {block}. 브라우저에서 마저 진행한 뒤 Enter 를 누르세요.")
                continue
            await safe_goto(page, "https://www.youtube.com/")
            yt = await login_state(page)
            await safe_goto(page, f"https://drive.google.com/drive/folders/{folder}", 5000)
            drive_ok = "accounts.google.com" not in page.url
            if (yt == "in" and drive_ok) or attempt == 3:
                break
            print(f"\n아직 로그인이 확인되지 않습니다(유튜브 {yt}, 드라이브 {'열림' if drive_ok else '로그인 필요'}). 브라우저에서 로그인을 마친 뒤 Enter 를 누르세요.")
            await safe_goto(page, "https://accounts.google.com/ServiceLogin?continue=https://www.youtube.com/", 2000)
        await ctx.close()
    print()
    print(f"유튜브: {'✅ 로그인됨' if yt == 'in' else '✖ 로그인 안 됨' if yt == 'out' else '? 화면 확인 불가'}")
    print(f"드라이브 업로드 폴더: {'✅ 열림' if drive_ok else '✖ 로그인 필요'}")
    if yt == "in" and drive_ok:
        (DATA / "yt_login_alert.json").unlink(missing_ok=True)  # 오늘 알림 기록 초기화
        print("\n완료 — 다음 자동 실행부터 게시판·방송 자막·드라이브 업로드가 다시 동작합니다.")
    else:
        print("\n로그인이 확인되지 않았습니다. 이 창을 캡처해서 김이사에게 보내 주세요.")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as exc:
        print(f"\n✖ 오류: {type(exc).__name__}: {exc}")
        print("  다른 브라우저 자동 실행이 돌고 있으면 끝난 뒤 다시 실행하세요.")

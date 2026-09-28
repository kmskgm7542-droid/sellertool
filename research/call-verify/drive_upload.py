"""
검토용 파일을 구글 드라이브 웹에 직접 올린다 — 드라이브 데스크톱 없이, 유튜브 수집기와 같은 로그인 프로필(data/yt_profile)의 브라우저로.
  실행: python drive_upload.py   (export_drive.py 가 드라이브 데스크톱 폴더를 못 찾으면 자동으로 이 방식을 쓴다)
  대상 폴더: 김이사가 대표 드라이브에 만든 'call-verify-sync' (FOLDER_ID). 같은 이름 충돌을 피하려고 파일명 앞에 시각을 붙인다.
  올리는 것: live_vod/*.json, live_calls.json, ledger.csv, results.json, summary.txt, report.md, pending_review.txt, 로그. 비밀 파일은 올리지 않는다.
"""
import asyncio
import json
import shutil
import sys
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
sys.path.insert(0, str(HERE))
from runlog import start as _start_log  # noqa: E402
from export_drive import collect  # noqa: E402

_start_log("drive_upload", DATA)
try:
    from playwright.async_api import async_playwright
except ImportError:
    print("playwright 가 없습니다. yt_posts.bat 을 한 번 실행하면 설치됩니다.")
    sys.exit(1)

FOLDER_ID = "1y3fcTU5lVLusZEuFVbIENZrQoATdz62E"  # 대표 드라이브 > 내 드라이브 > call-verify-sync
PROFILE = DATA / "yt_profile"
STAGE = DATA / "drive_stage"
CFG = DATA / "drive.json"


def stage_files():
    """시각 접두어를 붙인 복사본을 만든다(드라이브 웹은 같은 이름이면 중복 파일이 생기므로)."""
    stamp = datetime.now().strftime("%Y%m%d-%H%M")
    if STAGE.exists():
        shutil.rmtree(STAGE)
    STAGE.mkdir()
    out = []
    for src in collect():
        name = f"{stamp}_vod_{src.name}" if src.parent.name == "live_vod" else f"{stamp}_{src.name}"
        shutil.copy2(src, STAGE / name)
        out.append(STAGE / name)
    (STAGE / f"{stamp}__last_sync.txt").write_text(datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "utf-8")
    out.append(STAGE / f"{stamp}__last_sync.txt")
    return stamp, out


async def main():
    cfg = json.loads(CFG.read_text("utf-8")) if CFG.exists() else {}
    folder = cfg.get("folder_id") or FOLDER_ID
    stamp, files = stage_files()
    if not files:
        print("올릴 파일이 없습니다.")
        return
    url = f"https://drive.google.com/drive/folders/{folder}"
    async with async_playwright() as pw:
        ctx = await pw.chromium.launch_persistent_context(
            str(PROFILE), headless=False, locale="ko-KR", viewport={"width": 1200, "height": 900},
            args=["--disable-blink-features=AutomationControlled"],
        )
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        await page.goto(url, wait_until="domcontentloaded")
        await page.wait_for_timeout(4000)
        if "accounts.google.com" in page.url:
            print("✖ 브라우저가 구글에 로그인되어 있지 않습니다. yt_posts.bat 을 실행해 로그인한 뒤 다시 시도하세요.")
            await ctx.close()
            sys.exit(1)
        uploaded = 0
        try:
            # 드라이브 화면의 숨은 파일 입력을 직접 쓴다(폴더 입력은 제외). 없으면 '신규 → 파일 업로드' 메뉴로 파일 선택 창을 연다.
            inputs = page.locator("input[type=file]:not([webkitdirectory])")
            if await inputs.count() > 0:
                await inputs.first.set_input_files([str(f) for f in files])
            else:
                async with page.expect_file_chooser(timeout=15000) as fc_info:
                    await page.get_by_role("button", name="신규").first.click()
                    await page.wait_for_timeout(800)
                    await page.get_by_text("파일 업로드", exact=False).first.click()
                fc = await fc_info.value
                await fc.set_files([str(f) for f in files])
            # 완료 확인: 파일 목록에 시각 접두어가 보일 때까지 기다린다
            for _ in range(60):
                await page.wait_for_timeout(2000)
                seen = await page.locator(f"text={stamp}_").count()
                if seen >= len(files):
                    break
            await page.reload(wait_until="domcontentloaded")
            await page.wait_for_timeout(3000)
            uploaded = await page.locator(f"text={stamp}_").count()
        except Exception as exc:
            print(f"✖ 업로드 중 오류: {type(exc).__name__}: {str(exc)[:200]}")
        finally:
            try:
                await ctx.close()
            except Exception:
                pass
    print(f"드라이브 업로드: {uploaded}/{len(files)}개 확인 (접두어 {stamp}) → {url}")
    if uploaded < len(files):
        print("일부가 안 보이면 드라이브 웹에서 call-verify-sync 폴더를 직접 확인해 주세요.")
        sys.exit(1)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as exc:
        print(f"\n✖ 오류: {type(exc).__name__}: {exc}")
        sys.exit(1)

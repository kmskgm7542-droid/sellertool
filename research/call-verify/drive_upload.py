"""
검토용 파일을 구글 드라이브 웹에 직접 올린다 — 드라이브 데스크톱 없이, 유튜브 수집기와 같은 로그인 프로필(data/yt_profile)의 브라우저로.
  실행: python drive_upload.py   (export_drive.py 가 드라이브 데스크톱 폴더를 못 찾으면 자동으로 이 방식을 쓴다)
  대상 폴더: 김이사가 대표 드라이브에 만든 'call-verify-sync' (FOLDER_ID). 같은 이름 충돌을 피하려고 파일명 앞에 시각을 붙인다.
  올리는 것: live_vod/*.json, live_calls.json, ledger.csv, results.json, summary.txt, report.md, pending_review.txt, 로그. 비밀 파일은 올리지 않는다.
  방식: 한 번에 20개 넘게 넣으면 드라이브 웹이 몇 개를 조용히 떨어뜨리므로 5개씩 나눠 올린다.
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
CHUNK = 5  # 한 번에 올리는 파일 수


def stage_files():
    """시각 접두어를 붙인 복사본을 만든다(드라이브 웹은 같은 이름이면 중복 파일이 생기므로)."""
    stamp = datetime.now().strftime("%Y%m%d-%H%M")
    if STAGE.exists():
        shutil.rmtree(STAGE)
    STAGE.mkdir()
    out = []
    for src in collect():
        name = f"{stamp}_vod_{src.name}" if src.parent.name == "live_vod" else f"{stamp}_diag_{src.name}" if src.parent.name == "diag" else f"{stamp}_{src.name}"
        shutil.copy2(src, STAGE / name)
        out.append(STAGE / name)
    (STAGE / f"{stamp}__last_sync.txt").write_text(datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "utf-8")
    out.append(STAGE / f"{stamp}__last_sync.txt")
    return stamp, out


async def open_chooser(page):
    """'신규' 버튼 → '파일 업로드' 메뉴를 눌러 파일 선택 창을 연다."""
    try:
        await page.get_by_role("button", name="신규").first.click(timeout=10000)
        await page.wait_for_timeout(800)
    except Exception:
        pass
    async with page.expect_file_chooser(timeout=15000) as fc_info:
        item = page.get_by_role("menuitem", name="파일 업로드").first
        if await item.count() == 0:
            item = page.get_by_text("파일 업로드", exact=False).first
        try:
            await item.click(force=True, timeout=5000)
        except Exception:
            await item.dispatch_event("click")
    return await fc_info.value


async def upload_chunk(page, files):
    """파일 몇 개를 올린다. 1) 메뉴 → 파일 선택 창  2) 숨은 파일 입력  3) 끌어다 놓기 이벤트 순으로 시도."""
    paths = [str(f) for f in files]
    try:
        fc = await open_chooser(page)
        await fc.set_files(paths)
        return "메뉴 → 파일 선택 창"
    except Exception as exc:
        err = f"{type(exc).__name__}: {str(exc)[:80]}"
        try:
            await page.keyboard.press("Escape")
        except Exception:
            pass
    inputs = page.locator("input[type=file]:not([webkitdirectory])")
    if await inputs.count() > 0:
        try:
            await inputs.first.set_input_files(paths)
            return "숨은 파일 입력"
        except Exception as exc:
            err = f"{type(exc).__name__}: {str(exc)[:80]}"
    import base64
    payload = [{"name": f.name, "b64": base64.b64encode(f.read_bytes()).decode()} for f in files]
    dt = await page.evaluate_handle("""(items) => {
      const dt = new DataTransfer();
      for (const it of items) {
        const bin = atob(it.b64); const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        dt.items.add(new File([arr], it.name, { type: 'application/octet-stream' }));
      }
      return dt;
    }""", payload)
    target = page.locator("[role=main]").first
    if await target.count() == 0:
        target = page.locator("body")
    for ev in ("dragenter", "dragover", "drop"):
        await target.dispatch_event(ev, {"dataTransfer": dt})
        await page.wait_for_timeout(300)
    return f"끌어다 놓기 이벤트 (앞 방식 실패: {err})"


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
        seen = 0
        try:
            for k in range(0, len(files), CHUNK):
                chunk = files[k:k + CHUNK]
                how = await upload_chunk(page, chunk)
                print(f"  {k + 1}~{k + len(chunk)}/{len(files)} 올림 ({how})")
                # 다음 묶음 전에 전송이 끝날 시간을 준다(파일 크기 수십 KB 기준)
                await page.wait_for_timeout(5000 + 1500 * len(chunk))
            # 확인(참고용): 목록은 늦게 그려지거나 가상 스크롤로 일부만 보일 수 있어 숫자가 적게 나와도 실패로 보지 않는다
            await page.wait_for_timeout(8000)
            await page.reload(wait_until="domcontentloaded")
            await page.wait_for_timeout(8000)
            seen = await page.locator(f"text={stamp}_").count()
        except Exception as exc:
            print(f"✖ 업로드 중 오류: {type(exc).__name__}: {str(exc)[:200]}")
        finally:
            try:
                await ctx.close()
            except Exception:
                pass
    print(f"드라이브 업로드 요청 완료: {len(files)}개를 {CHUNK}개씩 나눠 올림 (화면에서 {seen}개 확인, 접두어 {stamp}) → {url}")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as exc:
        print(f"\n✖ 오류: {type(exc).__name__}: {exc}")
        sys.exit(1)

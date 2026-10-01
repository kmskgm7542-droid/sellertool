"""검토용 파일만 구글 드라이브 동기화 폴더로 복사한다 — 김이사가 드라이브에서 읽어 자동 검토하기 위함.
  설정: setup_drive.bat (구글 드라이브 데스크톱의 '내 드라이브' 폴더를 찾아 data/drive.json 에 저장)
  실행: python export_drive.py   (daily_run.bat / weekly_run.bat 끝에 자동)
  복사 대상: live_vod/*.json(방송 자막), live_calls.json, ledger.csv, results.json, summary.txt, report.md,
            pending_review.txt, *.log 요약. 토큰·세션·키 파일(tg_bot.json, tg_session, site.json, anthropic.json)은 복사하지 않는다.
"""
import json
import shutil
import sys
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
CFG = DATA / "drive.json"
FILES = ["live_calls.json", "ledger.csv", "results.json", "summary.txt", "report.md", "report.html", "pending_review.txt",
         "daily.log", "weekly.log", "live.log", "vod.log", "yt_live_run.log", "extract_run.log", "drive_upload_run.log",
         "yt_live_state.json", "extract_state.json"]


def find_drive_root():
    home = Path.home()
    cands = [home / "내 드라이브", home / "My Drive", home / "Google Drive" / "내 드라이브", home / "Google Drive" / "My Drive"]
    for letter in "DEFGHIJKLMNOPQRSTUVWXYZ":
        cands += [Path(f"{letter}:/내 드라이브"), Path(f"{letter}:/My Drive")]
    for c in cands:
        if c.is_dir():
            return c
    return None


def target_dir():
    cfg = json.loads(CFG.read_text("utf-8")) if CFG.exists() else {}
    if cfg.get("dir"):
        return Path(cfg["dir"])
    root = find_drive_root()
    return root / "call-verify-sync" if root else None


def collect():
    """복사 대상 파일 목록 (data/ 안의 검토용 파일만)."""
    out = [DATA / n for n in FILES if (DATA / n).exists()]
    vod = DATA / "live_vod"
    if vod.is_dir():
        out += sorted(vod.glob("*.json"))
    diag = DATA / "diag"
    if diag.is_dir():  # 자막 수집 실패 시 화면 진단(HTML·캡처·후보 목록) — 김이사가 정확히 고치기 위한 자료
        out += sorted(diag.glob("*"))[-6:]
    return out


def main():
    dst = target_dir()
    if not dst:
        # 드라이브 데스크톱 폴더가 없으면 브라우저(유튜브 로그인 프로필)로 드라이브 웹에 직접 올린다
        import subprocess
        print("구글 드라이브 데스크톱 폴더가 없어 브라우저 업로드로 대신합니다.")
        sys.exit(subprocess.run([sys.executable, str(HERE / "drive_upload.py")]).returncode)
    dst.mkdir(parents=True, exist_ok=True)
    (dst / "live_vod").mkdir(exist_ok=True)
    n = 0
    for name in FILES:
        src = DATA / name
        if src.exists():
            shutil.copy2(src, dst / name)
            n += 1
    vod = DATA / "live_vod"
    if vod.is_dir():
        for f in vod.glob("*.json"):
            shutil.copy2(f, dst / "live_vod" / f.name)
            n += 1
    (dst / "_last_sync.txt").write_text(datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "utf-8")
    print(f"드라이브 동기화 폴더로 {n}개 복사 → {dst}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"✖ 복사 실패: {type(exc).__name__}: {exc}")
        sys.exit(1)

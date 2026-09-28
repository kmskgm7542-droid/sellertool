"""성적표 웹페이지 연결 — 주소와 업로드 키를 data/site.json 에 저장하고 연결을 확인한다.
업로드 키는 여기서 만들어 보여주며, 같은 값을 Vercel 환경변수 CALLS_INGEST_KEY 에 넣어야 한다.
"""
import json
import secrets
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
CFG = DATA / "site.json"
DATA.mkdir(exist_ok=True)

old = json.loads(CFG.read_text("utf-8")) if CFG.exists() else {}
default_url = old.get("url") or "https://seller-tool.vercel.app"
url = input(f"성적표 사이트 주소 [Enter={default_url}]: ").strip() or default_url
url = url.rstrip("/")
if not url.startswith("http"):
    url = "https://" + url

key = old.get("key") or secrets.token_hex(24)
if old.get("key"):
    print("업로드 키는 기존 값을 유지합니다. (새로 만들려면 data\\site.json 을 지우고 다시 실행)")
CFG.write_text(json.dumps({"url": url, "key": key}, indent=1), "utf-8")

print()
print("=== Vercel 에 넣을 값 (프로젝트 → Settings → Environment Variables) ===")
print("  CALLS_INGEST_KEY =", key)
print("  CALLS_PASSWORD   = (대표님이 정한 페이지 비밀번호)")
print("  + Storage 탭에서 Blob 저장소 만들기 → Connect (BLOB_READ_WRITE_TOKEN 자동 등록)")
print("  넣은 뒤 Deployments → 최신 배포 → Redeploy")
print()
input("위 설정을 마쳤으면 Enter (아직이면 창을 닫고 나중에 setup_site.bat 을 다시 실행)...")
r = subprocess.run([sys.executable, str(HERE / "publish.py"), "--check"])
if r.returncode == 0 and (DATA / "results.json").exists():
    subprocess.run([sys.executable, str(HERE / "publish.py")])
sys.exit(r.returncode)

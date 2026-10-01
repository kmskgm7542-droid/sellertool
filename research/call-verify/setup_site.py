"""성적표 웹페이지 연결 — 비밀 주소 방식(Vercel 설정 불필요).
48자 비밀 키를 만들어 data/site.json 에 저장한다. 이 키가 업로드 키이자 보기 주소(/calls/<키>)다.
키를 아는 사람만 올리고 볼 수 있으므로 주소를 남에게 보내지 않는다. 주소를 잊으면 이 파일을 다시 실행하면 같은 주소를 보여준다.
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
DEFAULT_URL = "https://sellertool.vercel.app"  # 셀러툴 운영 주소(Vercel 프로젝트 sellertool, master 브랜치)
default_url = old.get("url") or DEFAULT_URL
if default_url.rstrip("/") == "https://seller-tool.vercel.app":  # 예전 안내의 잘못된 주소는 바꿔 제안
    default_url = DEFAULT_URL
url = input(f"성적표 사이트 주소 [Enter={default_url}]: ").strip() or default_url
url = url.rstrip("/")
if not url.startswith("http"):
    url = "https://" + url

key = old.get("key") or secrets.token_hex(24)
if old.get("key"):
    print("비밀 키는 기존 값을 유지합니다. (새 주소를 원하면 data\\site.json 을 지우고 다시 실행)")
cfg = {"url": url, "key": key}
if old.get("mode") == "password":  # 옛 비밀번호 방식을 쓰던 설정은 그대로 둔다
    cfg["mode"] = "password"
CFG.write_text(json.dumps(cfg, indent=1), "utf-8")

view = url + "/calls" if cfg.get("mode") == "password" else f"{url}/calls/{key}"
print()
print("=== 성적표 주소 (휴대폰·PC 브라우저에 즐겨찾기) ===")
print("  ", view)
print("  이 주소를 아는 사람만 볼 수 있습니다. 남에게 보내지 마세요.")
print()
r = subprocess.run([sys.executable, str(HERE / "publish.py"), "--check"])
if r.returncode == 0 and (DATA / "results.json").exists():
    subprocess.run([sys.executable, str(HERE / "publish.py")])
elif r.returncode == 0:
    print("아직 성적표 데이터가 없습니다. weekly_run.bat 을 한 번 실행하면 첫 성적표가 올라갑니다.")
print()
input("Enter 를 누르면 닫힙니다...")
sys.exit(r.returncode)

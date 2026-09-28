"""구글 드라이브 데스크톱의 '내 드라이브' 폴더를 찾아 data/drive.json 에 저장하고 첫 복사를 한다."""
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
CFG = DATA / "drive.json"
DATA.mkdir(exist_ok=True)
sys.path.insert(0, str(HERE))
from export_drive import find_drive_root  # noqa: E402

root = find_drive_root()
if root:
    print(f"구글 드라이브 폴더 발견: {root}")
    dst = root / "call-verify-sync"
else:
    print("PC에서 구글 드라이브 동기화 폴더('내 드라이브')를 찾지 못했습니다.")
    print("1) 'Google Drive 데스크톱' 이 설치되어 있으면 그 폴더 경로를 아래에 붙여넣으세요 (예: G:\\내 드라이브)")
    print("2) 설치가 안 되어 있으면 Enter 만 누르세요. 다운로드 페이지를 엽니다.")
    p = input("드라이브 폴더 경로: ").strip().strip('"')
    if not p:
        subprocess.run(["cmd", "/c", "start", "https://www.google.com/drive/download/"])
        print("설치 후 구글 계정(kmskgm7542@gmail.com)으로 로그인하고, 이 파일을 다시 실행하세요.")
        sys.exit(1)
    root = Path(p)
    if not root.is_dir():
        print("그런 폴더가 없습니다.")
        sys.exit(1)
    dst = root / "call-verify-sync"
CFG.write_text(json.dumps({"dir": str(dst)}, ensure_ascii=False, indent=1), "utf-8")
print(f"동기화 폴더: {dst}")
r = subprocess.run([sys.executable, str(HERE / "export_drive.py")])
if r.returncode == 0:
    print("✅ 설정 완료. 이제 매일 21:30·매주 배치가 끝나면 검토용 파일이 이 폴더로 복사되고, 드라이브가 올려 줍니다.")
sys.exit(r.returncode)

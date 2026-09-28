"""사생팬알림방 사진 알림만 골라 zip 으로 묶는다 (김이사가 화면 글자를 읽어 콜로 옮기기 위함).
  실행: pick_media.bat   결과: data/사생팬사진.zip
"""
import json
import zipfile
from pathlib import Path

DATA = Path(__file__).resolve().parent / "data"
msgs = json.loads((DATA / "result.json").read_text("utf-8"))["messages"]
picked = [m for m in msgs if "사생팬" in (m.get("channel") or "") and m.get("media")]
out = DATA / "사생팬사진.zip"
n = 0
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for m in picked:
        f = DATA / "tg_media" / m["media"]
        if f.exists():
            # 파일명에 게시 시각을 붙여 두면 사진만 봐도 언제 올라왔는지 안다
            stamp = m["date"].replace(":", "").replace("-", "")[:15]
            z.write(f, f"{stamp}_{m['id']}{f.suffix}")
            n += 1
        else:
            print(f"  없음: {f.name}")
print(f"사생팬 사진 {n}장 → {out}")
print("이 zip 파일을 김이사에게 올려주세요.")

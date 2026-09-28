"""텔레그램 사진 알림을 골라 zip 으로 묶는다 (김이사가 사진 속 콜을 읽어 장부에 옮기기 위함).
  실행: pick_media.bat                 → 사생팬알림방 전체       → data/사생팬사진.zip
        pick_media_public.bat          → 정보 알림 채널 최근 60일 → data/공개채널사진.zip
  직접: python pick_media.py <채널 키워드> <최근 N일 | all> <출력파일명>
"""
import json
import sys
import time
import zipfile
from pathlib import Path

DATA = Path(__file__).resolve().parent / "data"
keyword = sys.argv[1] if len(sys.argv) > 1 else "사생팬"
days = sys.argv[2] if len(sys.argv) > 2 else "all"
outname = sys.argv[3] if len(sys.argv) > 3 else "사생팬사진.zip"

msgs = json.loads((DATA / "result.json").read_text("utf-8"))["messages"]
since = 0 if days == "all" else time.time() - int(days) * 86400
picked = [m for m in msgs if keyword in (m.get("channel") or "") and m.get("media") and int(m["date_unixtime"]) >= since]
out = DATA / outname
n = 0
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for m in picked:
        f = DATA / "tg_media" / m["media"]
        if f.exists():
            stamp = m["date"].replace(":", "").replace("-", "")[:15]  # 파일명에 게시 시각(UTC)
            z.write(f, f"{stamp}_{m['id']}{f.suffix}")
            n += 1
        else:
            print(f"  없음: {f.name}")
print(f"'{keyword}' 사진 {n}장 → {out}")
print("이 zip 파일을 김이사에게 올려주세요.")

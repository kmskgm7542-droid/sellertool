"""주간 성적표를 텔레그램(우리 봇 → 대표)으로 보낸다.
  설정: setup_bot.bat (봇 토큰·chat_id 를 data/tg_bot.json 에 저장)
  실행: python notify.py            → data/summary.txt 본문 + data/report.md 첨부
        python notify.py "문장"     → 문장만 전송(테스트)
"""
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

DATA = Path(__file__).resolve().parent / "data"
CFG = DATA / "tg_bot.json"


def cfg():
    if not CFG.exists():
        print("data/tg_bot.json 이 없습니다. setup_bot.bat 을 먼저 실행하세요.")
        sys.exit(1)
    return json.loads(CFG.read_text("utf-8"))


def send_text(c, text):
    url = f"https://api.telegram.org/bot{c['token']}/sendMessage"
    body = urllib.parse.urlencode({"chat_id": c["chat_id"], "text": text[:4000]}).encode()
    with urllib.request.urlopen(urllib.request.Request(url, data=body), timeout=30) as r:
        return json.loads(r.read())["ok"]


def send_file(c, path, caption=""):
    boundary = "----callverify"
    data = path.read_bytes()
    parts = [
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"chat_id\"\r\n\r\n{c['chat_id']}\r\n",
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"caption\"\r\n\r\n{caption}\r\n",
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"document\"; filename=\"{path.name}\"\r\nContent-Type: text/plain\r\n\r\n",
    ]
    body = "".join(parts).encode("utf-8") + data + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{c['token']}/sendDocument", data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())["ok"]


def main():
    c = cfg()
    if len(sys.argv) > 1:
        print("전송:", send_text(c, sys.argv[1]))
        return
    summary = DATA / "summary.txt"
    if not summary.exists():
        print("data/summary.txt 가 없습니다. 먼저 node run.mjs sim 을 실행하세요.")
        sys.exit(1)
    print("성적표 전송:", send_text(c, summary.read_text("utf-8")))
    report = DATA / "report.md"
    if report.exists():
        print("보고서 첨부:", send_file(c, report, "콜 검증 상세 보고서"))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"✖ 전송 실패: {type(exc).__name__}: {exc}")
        sys.exit(1)

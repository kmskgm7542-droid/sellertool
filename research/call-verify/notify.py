"""주간 성적표를 텔레그램(우리 봇 → 대표)으로 보낸다.
  설정: setup_bot.bat (봇 토큰·chat_id 를 data/tg_bot.json 에 저장)
  실행: python notify.py            → data/summary.txt 본문 + data/report.md 첨부
        python notify.py "문장"     → 문장만 전송(테스트)
"""
import json
import shutil
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


def send_file(c, path, caption="", content_type="text/plain"):
    boundary = "----callverify"
    data = path.read_bytes()
    parts = [
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"chat_id\"\r\n\r\n{c['chat_id']}\r\n",
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"caption\"\r\n\r\n{caption}\r\n",
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"document\"; filename=\"{path.name}\"\r\nContent-Type: {content_type}\r\n\r\n",
    ]
    body = "".join(parts).encode("utf-8") + data + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{c['token']}/sendDocument", data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())["ok"]


def site_link():
    site = DATA / "site.json"
    if not site.exists():
        return ""
    try:
        s = json.loads(site.read_text("utf-8"))
        base = s["url"].rstrip("/")
        return base + "/calls" if s.get("mode") == "password" else f"{base}/calls/{s['key']}"
    except Exception:
        return ""


def daily_line():
    """일간 갱신 한 줄: 결과 파일(results.json)에서 핵심 수치만."""
    f = DATA / "results.json"
    if not f.exists():
        return None
    s = json.loads(f.read_text("utf-8"))
    a = s["stats"]["A"]
    fx = lambda x, d=2: "-" if not isinstance(x, (int, float)) else f"{x:.{d}f}"  # noqa: E731
    pc = lambda x: "-" if not isinstance(x, (int, float)) else f"{x * 100:.1f}%"  # noqa: E731
    open_n = sum(1 for c in s.get("calls", []) if c.get("status") == "OPEN")
    pend = len(s.get("pending", []))
    text = (f"📅 일간 갱신 {s.get('generatedAt', '')[:10]} · {a.get('verdict', '')}\n"
            f"체결 {a.get('filled', 0)}건 · 승률 {pc(a.get('winRate'))} · 평균 {fx(a.get('meanR'))}R · PF {fx(a.get('pf'))} · MDD {pc(a.get('mdd'))} · 보유중 {open_n}건"
            + (f" · 검토 필요 {pend}건" if pend else ""))
    link = site_link()
    return text + (f"\n🔗 {link}" if link else "")


def main():
    c = cfg()
    if "--daily" in sys.argv:
        line = daily_line()
        if not line:
            print("data/results.json 이 없어 일간 갱신 메시지를 보내지 않습니다.")
            return
        print("일간 갱신 전송:", send_text(c, line))
        return
    if len(sys.argv) > 1:
        print("전송:", send_text(c, sys.argv[1]))
        return
    summary = DATA / "summary.txt"
    if not summary.exists():
        print("data/summary.txt 가 없습니다. 먼저 node run.mjs sim 을 실행하세요.")
        sys.exit(1)
    text = summary.read_text("utf-8")
    link = site_link()
    if link:
        text += "\n\n🔗 성적표 웹: " + link
    print("성적표 전송:", send_text(c, text))
    # 성적표 파일(판정·자산 곡선·콜 목록) — 파일을 누르면 휴대폰·PC 브라우저에서 바로 열린다. 호스팅·로그인 불필요.
    html = DATA / "report.html"
    if html.exists():
        week = ""
        try:
            week = json.loads((DATA / "results.json").read_text("utf-8")).get("week", "")
        except Exception:
            pass
        named = DATA / f"성적표_{week or 'latest'}.html"
        shutil.copyfile(html, named)
        print("성적표 파일 첨부:", send_file(c, named, "📊 성적표 — 파일을 눌러 브라우저로 열기", "text/html"))
    report = DATA / "report.md"
    if report.exists():
        print("보고서 첨부:", send_file(c, report, "콜 검증 상세 보고서(텍스트)"))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"✖ 전송 실패: {type(exc).__name__}: {exc}")
        sys.exit(1)

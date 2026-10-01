"""주간 결과(data/results.json)를 성적표 웹페이지에 올린다.
  설정: setup_site.bat (주소·키 → data/site.json). 키는 업로드 키이자 보기 주소(/calls/<키>)다. Vercel 환경변수 불필요.
  실행: python publish.py           → results.json 업로드
        python publish.py --check   → 연결 확인만
        python publish.py --url     → 보기 주소만 출력
"""
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

DATA = Path(__file__).resolve().parent / "data"
CFG = DATA / "site.json"


def cfg():
    if not CFG.exists():
        print("data/site.json 이 없습니다. setup_site.bat 을 먼저 실행하세요.")
        sys.exit(1)
    c = json.loads(CFG.read_text("utf-8"))
    c["url"] = c["url"].rstrip("/")
    return c


def view_url(c):
    """성적표 보기 주소. 비밀 주소 방식이면 /calls/<키>, 옛 비밀번호 방식(password 표시)이면 /calls."""
    if c.get("mode") == "password":
        return c["url"] + "/calls"
    return f"{c['url']}/calls/{c['key']}"


def call(c, method, body=None):
    req = urllib.request.Request(
        f"{c['url']}/api/calls/ingest", data=body, method=method,
        headers={"x-ingest-key": c["key"], "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except Exception:
            return e.code, {"error": str(e)}


def explain(status, res):
    if status == 200 and res.get("ok"):
        return None
    if status == 401:
        return "서버가 키를 받지 않습니다. data\\site.json 을 지우고 setup_site.bat 을 다시 실행하세요."
    if status == 503:
        return "Vercel 프로젝트에 Blob 저장소가 연결되지 않았습니다(Storage → Blob → Connect Project)."
    if status == 404:
        return "주소가 틀렸거나 아직 새 버전이 배포되지 않았습니다(/api/calls/ingest 없음). 몇 분 뒤 다시 시도하세요."
    return f"서버 응답 {status}: {res.get('error') or res}"


def main():
    c = cfg()
    if "--url" in sys.argv:
        print(view_url(c))
        return
    if "--check" in sys.argv:
        status, res = call(c, "GET")
        err = explain(status, res)
        if err:
            print("✖", err)
            sys.exit(1)
        if res.get("store") != "ready":
            print("✖ 서버는 응답하지만 Blob 저장소가 연결되지 않았습니다(Storage → Blob → Connect Project).")
            sys.exit(1)
        print("✅ 연결 확인. 성적표 주소:", view_url(c))
        return
    f = DATA / "results.json"
    if not f.exists():
        print("data/results.json 이 없습니다. 먼저 node run.mjs sim 을 실행하세요.")
        sys.exit(1)
    status, res = call(c, "POST", f.read_bytes())
    err = explain(status, res)
    if err:
        print("✖ 업로드 실패:", err)
        sys.exit(1)
    print(f"✅ 업로드 완료: {res.get('week')} 체결 {res.get('filled')}건 · 누적 {res.get('weeks')}주 → {view_url(c)}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"✖ 업로드 실패: {type(exc).__name__}: {exc}")
        sys.exit(1)

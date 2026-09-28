"""종목 목록 내려받기 — 업비트 원화마켓(코인 한글명→마켓코드), 한국거래소 상장사(회사명→종목코드).
  실행: markets.bat   결과: data/upbit_markets.json, data/krx_list.json  (한 달에 한 번쯤 갱신)
"""
import json
import re
import sys
import urllib.request
from pathlib import Path

DATA = Path(__file__).resolve().parent / "data"
DATA.mkdir(exist_ok=True)


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


try:
    rows = json.loads(get("https://api.upbit.com/v1/market/all?isDetails=false"))
    up = {r["korean_name"]: r["market"] for r in rows if r["market"].startswith("KRW-")}
    (DATA / "upbit_markets.json").write_text(json.dumps(up, ensure_ascii=False, indent=1), "utf-8")
    print(f"업비트 원화마켓 {len(up)}종목 저장")
except Exception as exc:
    print(f"업비트 목록 실패: {exc}")

krx = {}
try:
    # 네이버 증권(모바일 API): 코스피·코스닥 시가총액 순 전체 목록, 100개씩 페이지
    for market in ("KOSPI", "KOSDAQ"):
        page = 1
        while page < 60:
            j = json.loads(get(f"https://m.stock.naver.com/api/stocks/marketValue/{market}?page={page}&pageSize=100"))
            items = j.get("stocks") or j.get("result") or []
            if not items:
                break
            for it in items:
                code, name = it.get("itemCode"), it.get("stockName")
                if code and name and re.fullmatch(r"\d{6}", code):
                    krx[name] = code
            if len(items) < 100:
                break
            page += 1
    print(f"네이버: 코스피·코스닥 {len(krx)}종목")
except Exception as exc:
    print(f"네이버 목록 실패: {exc}")

if len(krx) < 500:
    try:  # 예비: 한국거래소 KIND
        html = get("https://kind.krx.co.kr/corpgeneral/corpList.do?method=download&searchType=13").decode("euc-kr", "ignore")
        for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.S):
            tds = [re.sub(r"<[^>]+>", "", t).strip() for t in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)]
            if len(tds) >= 2 and re.fullmatch(r"\d{6}", tds[1]):
                krx.setdefault(tds[0], tds[1])
        print(f"KIND 포함 {len(krx)}종목")
    except Exception as exc:
        print(f"KIND 목록 실패: {exc}")

(DATA / "krx_list.json").write_text(json.dumps(krx, ensure_ascii=False, indent=1), "utf-8")
print(f"국내주식 {len(krx)}종목 저장 → {DATA / 'krx_list.json'}")
if len(krx) < 500:
    print("⚠ 종목 수가 너무 적습니다. 이 창을 캡처해 주세요.")
    sys.exit(1)

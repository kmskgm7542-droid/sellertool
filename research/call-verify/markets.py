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

try:
    html = get("https://kind.krx.co.kr/corpgeneral/corpList.do?method=download&searchType=13").decode("euc-kr", "ignore")
    krx = {}
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.S):
        tds = [re.sub(r"<[^>]+>", "", t).strip() for t in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)]
        if len(tds) >= 2 and re.fullmatch(r"\d{6}", tds[1]):
            krx[tds[0]] = tds[1]
    (DATA / "krx_list.json").write_text(json.dumps(krx, ensure_ascii=False, indent=1), "utf-8")
    print(f"한국거래소 상장사 {len(krx)}종목 저장")
except Exception as exc:
    print(f"거래소 목록 실패: {exc}")
    sys.exit(1)

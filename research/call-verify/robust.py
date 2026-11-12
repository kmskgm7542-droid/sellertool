"""콜 검증 결과의 견고성 점검 (본인 검증용) — run.mjs sim 이 만든 data/results.csv 와 data/ledger.csv 로
  큰 수익 1·2건 제외, 부트스트랩 신뢰구간, 시간순 앞/뒤 절반(워크포워드), 월별, 시장·채널별,
  게시 시점 국면(BTC·코스닥 20일선 위/아래)별 성과와 현재 지수 국면(20·60·120일선)을 출력한다.
  합격 판정은 config.mjs 사전 기준(체결 50건, t≥2, PF≥1.3, MDD≥-15%)이 기준이고, 이 점검은 그 판단을 돕는 보조 자료다.
  실행: node run.mjs sim → python robust.py   (출력만 하고 파일은 만들지 않는다)
"""
import csv, json, random, statistics as st, sys, re
from datetime import datetime, timezone, timedelta
sys.path.insert(0,'.')
from fetch_prices import get, naver_daily
KST=timezone(timedelta(hours=9))
led={r['id']:r for r in csv.DictReader(open('data/ledger.csv',encoding='utf-8-sig'))}
res=[r for r in csv.DictReader(open('data/results.csv',encoding='utf-8-sig')) if r['status']=='FILLED']
for r in res: r['R']=float(r['R']); r['t']=int(led[r['id']]['t_post_unix']); r['ch']=led[r['id']]['channel']
res.sort(key=lambda r:r['t'])
R=[r['R'] for r in res]
def summ(x):
    if len(x)<2: return f"n={len(x)} mean={x[0] if x else float('nan'):+.2f}"
    m=st.mean(x); sd=st.stdev(x); t=m/(sd/len(x)**0.5)
    w=sum(v>0 for v in x)/len(x)
    gp=sum(v for v in x if v>0); gl=-sum(v for v in x if v<0)
    return f"n={len(x):2d} 승률 {w*100:3.0f}% 평균 {m:+.2f}R 중앙 {st.median(x):+.2f}R t {t:+.2f} PF {gp/gl if gl else float('inf'):.2f}"
print("전체        ", summ(R))
top=max(res,key=lambda r:r['R']); print(f"최대 수익 1건 제외({top['id']} {top['R']:+.1f}R) ", summ([r['R'] for r in res if r is not top]))
s=sorted(R,reverse=True); print("상위 2건 제외 ", summ(s[2:]))
random.seed(1); B=[st.mean(random.choices(R,k=len(R))) for _ in range(20000)]; B.sort()
print(f"부트스트랩 평균R 95% 구간 [{B[500]:+.2f}, {B[19500]:+.2f}], 평균R≤0 확률 {sum(b<=0 for b in B)/len(B)*100:.0f}%")
mid=len(res)//2
print("앞 절반(시간순)", summ([r['R'] for r in res[:mid]]), datetime.fromtimestamp(res[0]['t'],KST).strftime('%m/%d'),'~',datetime.fromtimestamp(res[mid-1]['t'],KST).strftime('%m/%d'))
print("뒤 절반(시간순)", summ([r['R'] for r in res[mid:]]), datetime.fromtimestamp(res[mid]['t'],KST).strftime('%m/%d'),'~',datetime.fromtimestamp(res[-1]['t'],KST).strftime('%m/%d'))
for mo in sorted({datetime.fromtimestamp(r['t'],KST).strftime('%Y-%m') for r in res}):
    print(f"{mo} 게시   ", summ([r['R'] for r in res if datetime.fromtimestamp(r['t'],KST).strftime('%Y-%m')==mo]))
for m in ('KRX','UPBIT'): print(f"{m:12s}", summ([r['R'] for r in res if r['market']==m]))
for ch in sorted({r['ch'] for r in res}): print(f"{ch:12s}", summ([r['R'] for r in res if r['ch']==ch]))
# 국면: 게시일 기준 전날 종가가 20일선 위인지
def daily_upbit(mk):
    rows=get(f"https://api.upbit.com/v1/candles/days?market={mk}&count=200")
    return sorted((c['candle_date_time_kst'][:10].replace('-',''),c['trade_price']) for c in rows)
def daily_naver(code):
    return [(datetime.fromtimestamp(t+9*3600,timezone.utc).strftime('%Y%m%d'),c) for t,o,h,l,c in naver_daily(code,200)]
idx={'BTC':daily_upbit('KRW-BTC'),'KOSPI':daily_naver('KOSPI'),'KOSDAQ':daily_naver('KOSDAQ')}
def above(series,day,n=20):
    prior=[c for d,c in series if d<day]
    if len(prior)<n: return None
    return prior[-1]>sum(prior[-n:])/n
for r in res:
    d=datetime.fromtimestamp(r['t'],KST).strftime('%Y%m%d')
    r['reg']=above(idx['BTC' if r['market']=='UPBIT' else 'KOSDAQ'],d)
print("상승 국면 게시(BTC·코스닥>20일선)", summ([r['R'] for r in res if r['reg']]))
print("하락 국면 게시                   ", summ([r['R'] for r in res if r['reg'] is False]))
# 현재 국면
for k,s_ in idx.items():
    c=[x for _,x in s_]; last=c[-1]
    ma=lambda n: sum(c[-n:])/n
    print(f"현재 {k}: 종가 {last:,.0f} · 20일선 {'위' if last>ma(20) else '아래'}({last/ma(20)-1:+.1%}) · 60일선 {'위' if last>ma(60) else '아래'}({last/ma(60)-1:+.1%}) · 120일선 {'위' if last>ma(120) else '아래'}({last/ma(120)-1:+.1%}) · 20일선 기울기 {ma(20)/(sum(c[-25:-5])/20)-1:+.1%}/5일 · 기준일 {s_[-1][0]}")
print("시간순 R:", ' '.join(f"{r['id']}:{r['R']:+.1f}" for r in res))

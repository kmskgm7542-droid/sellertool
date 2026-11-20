// 방송 가격 예측 적중 기록 + 매수가 도달 확률 — 관심종목 보조(11/20 대표 승인 2·3번)
//   1) 예측 적중: 방송 자막에서 관심종목(+삼성전자·하이닉스)의 '가격 예상'("17만 원까지 내려왔다가", "20만 원까지 열려")을 뽑아
//      data/forecasts.json 에 쌓고, 그 뒤 실제 시세(일봉 고가·저가)로 기한(주식 20거래일·코인 30일) 안에 닿았는지 판정한다.
//      자동 추출이라 참고용 — 방송자가 말한 가격이 실제로 맞는 편인지 보는 근거로만 쓴다.
//   2) 도달 확률: 최근 1년 일봉으로 '이 기간 안에 그 가격을 찍을 확률'을 두 방식으로 계산해 범위로 보여 준다.
//      ① 변동성 기준(방향 제거한 일간 수익률을 무작위로 이어 붙여 4천 번 모의) ② 과거 실제 빈도(그만큼 움직인 적이 얼마나 있었나)
//      날짜 예측이 아니다 — 가능성 범위.
import fs from 'node:fs';
import path from 'node:path';
import { DATA } from './watchlist.mjs';

export const FORECAST_FILE = path.join(DATA, 'forecasts.json');
const readJson = (f, d) => { try { return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d; } catch { return d; } };
export const loadForecasts = (f = FORECAST_FILE) => { const j = readJson(f, null) || {}; return { items: j.items || [], videos: j.videos || {} }; };
export const saveForecasts = (j, f = FORECAST_FILE) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(j, null, 1)); };

// ── 일봉 [{d:'YYYYMMDD', o,h,l,c}] ──
export async function history(market, symbol, count = 300) {
  const ua = { 'User-Agent': 'Mozilla/5.0' };
  if (market === 'KRX') {
    const r = await fetch(`https://fchart.stock.naver.com/sise.nhn?symbol=${symbol}&timeframe=day&count=${count}&requestType=0`, { headers: ua, signal: AbortSignal.timeout(20000) });
    const t = await r.text();
    return [...t.matchAll(/data="(\d{8})\|([\d.]+)\|([\d.]+)\|([\d.]+)\|([\d.]+)\|/g)]
      .map((m) => ({ d: m[1], o: +m[2], h: +m[3], l: +m[4], c: +m[5] })).filter((b) => b.l > 0 && b.c > 0);
  }
  if (market === 'UPBIT') {
    const r = await fetch(`https://api.upbit.com/v1/candles/days?market=${symbol}&count=${Math.min(count, 200)}`, { headers: ua, signal: AbortSignal.timeout(20000) });
    const j = await r.json();
    return j.map((x) => ({ d: x.candle_date_time_kst.slice(0, 10).replace(/-/g, ''), o: x.opening_price, h: x.high_price, l: x.low_price, c: x.trade_price })).sort((a, b) => (a.d < b.d ? -1 : 1));
  }
  return [];
}

// ── 도달 확률 ──
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
// bars: 일봉, level: 가격, down: 아래로 닿기(true)/위로(false), horizons: [20,60] 봉 수
export function hitProb(bars, level, horizons, down, { look = 250, n = 4000, seed = 1 } = {}) {
  const b = bars.slice(-(look + 1));
  if (b.length < 30 || !(level > 0)) return null;
  const lr = [];
  const ext = [];
  for (let i = 1; i < b.length; i++) {
    lr.push(Math.log(b[i].c / b[i - 1].c));
    ext.push(Math.log((down ? b[i].l : b[i].h) / b[i].c)); // 장중 저가(고가)까지의 거리 — 종가만 보면 닿은 날을 놓친다
  }
  const mu = lr.reduce((a, x) => a + x, 0) / lr.length;
  const r = lr.map((x) => x - mu); // 방향(추세) 제거 — 변동성만 남긴다
  const p0 = Math.log(b[b.length - 1].c);
  const L = Math.log(level);
  const H = Math.max(...horizons);
  const rand = rng(seed);
  const times = [];
  for (let k = 0; k < n; k++) {
    let lp = p0;
    let t = null;
    for (let d = 1; d <= H; d++) {
      const j = Math.floor(rand() * r.length);
      lp += r[j];
      const e = lp + ext[j];
      if (down ? e <= L : e >= L) { t = d; break; }
    }
    times.push(t);
  }
  const mc = Object.fromEntries(horizons.map((h) => [h, times.filter((t) => t && t <= h).length / n]));
  // 과거 실제 빈도: 각 날 종가에서 같은 비율만큼 움직인 적이 h봉 안에 있었나
  const ratio = level / b[b.length - 1].c;
  const all = bars;
  const emp = {};
  for (const h of horizons) {
    let tot = 0;
    let hit = 0;
    for (let i = Math.max(0, all.length - 500); i + h < all.length; i++) {
      const lv = all[i].c * ratio;
      tot++;
      for (let j = i + 1; j <= i + h; j++) if (down ? all[j].l <= lv : all[j].h >= lv) { hit++; break; }
    }
    emp[h] = tot ? hit / tot : null;
  }
  return { mc, emp };
}
export function probText(p, horizons, unit = '일') {
  if (!p) return '';
  return horizons.map((h) => {
    const a = p.mc[h];
    const e = p.emp[h];
    const lo = Math.round(Math.min(a, e ?? a) * 100);
    const hi = Math.round(Math.max(a, e ?? a) * 100);
    return `${h}${unit} ${lo === hi ? lo : `${lo}~${hi}`}%`;
  }).join(' · ');
}

// ── 예측 추출 ──
// 말투 숫자 정리: "16만4,000원" → 164000원, "17만 원" → 170000원, "2만5천" → 25000원. 비율(%)은 지운다.
export function speechPrices(text) {
  let s = String(text).replace(/(\d),(?=\d{3}(?!\d))/g, '$1').replace(/\d[\d.]*\s*(?:%|프로|퍼센트)/g, ' ');
  s = s.replace(/(\d+)\s*만\s*(\d)\s*천/g, (_, a, b) => `${Number(a) * 10000 + Number(b) * 1000}원`);
  s = s.replace(/(\d+)\s*만\s*(\d{1,4})(?![\d.]|\s*(?:천|만|억))/g, (_, a, b) => `${Number(a) * 10000 + Number(b)}원`);
  const out = [];
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)\s*(억|만|천)?\s*(원)?/g)) {
    if (!m[2] && !m[3]) continue; // 단위 없는 맨 숫자(시간·개수)는 가격으로 보지 않는다
    const v = Number(m[1]) * (m[2] === '억' ? 1e8 : m[2] === '만' ? 1e4 : m[2] === '천' ? 1e3 : 1);
    if (v > 0) out.push(v);
  }
  return out;
}
const CUE = /까지|도달|열려|열리|간다|갈\s*수|가겠|빠질|빠진다|내려(?:올|갈|와)|올라(?:갈|올|가)|저항|지지|반등|돌파|찍/;
const NOT = /물려|단가|샀|매수했|들어가서|계좌|수익|손실|원어치|투자금|만\s*원\s*(?:들어|넣)|월급|용돈|치킨|상금/;
// segs: 자막 구간, nameRe: 종목 이름 정규식, canonical: 별칭→공식 이름, allow: 대상 이름 Set
export function findForecasts(segs, nameRe, canonical, allow) {
  const out = [];
  const seen = new Set();
  for (let i = 0; i < segs.length; i++) {
    const names = [...new Set(segs[i].text.match(nameRe) || [])].map(canonical).filter((n) => allow.has(n));
    if (!names.length) continue;
    // 가격은 그 구간에서 먼저 찾고, 없을 때만 바로 다음 구간까지 본다(다음 문장의 '물려 있으면' 같은 말에 휘둘리지 않게)
    const win = speechPrices(segs[i].text).length ? segs[i].text : segs.slice(i, i + 2).map((s) => s.text).join(' ');
    if (!CUE.test(win) || NOT.test(win)) continue;
    for (const price of speechPrices(win)) {
      const key = `${names[0]}|${price}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name: names[0], t: segs[i].t, price, excerpt: win.slice(0, 120) });
    }
  }
  return out;
}

// 예측 판정: 말한 날 종가보다 낮으면 '하락 예상'(저가가 닿으면 적중), 높으면 '상승 예상'(고가가 닿으면 적중).
// 말한 날 종가에서 ±40% 밖 숫자는 계좌 금액·옛날 가격 이야기로, 2% 안쪽은 현재가 언급으로 보고 버린다(null).
// exp = 그날 변동성만으로 기한 안에 닿을 확률. 판정 모음의 '적중 수'를 '기대 적중 수(exp 합)'와 비교해야 실력이 보인다.
export function judge(f, bars, horizon) {
  const i = bars.findIndex((b) => b.d >= f.day);
  if (i < 0) return { status: 'pending' };
  const base = bars[i].c;
  if (!(f.price > base * 0.6 && f.price < base * 1.4)) return null;
  // 말한 날 종가와 2% 안쪽은 '지금 가격' 언급이라 예측으로 보지 않는다(닿는 게 당연)
  if (Math.abs(f.price / base - 1) < 0.02) return null;
  const down = f.price < base;
  const after = bars.slice(i + 1, i + 1 + horizon);
  const hit = after.find((b) => (down ? b.l <= f.price : b.h >= f.price));
  const st = hit ? 'hit' : after.length >= horizon ? 'miss' : 'pending';
  const best = after.length ? (down ? Math.min(...after.map((b) => b.l)) : Math.max(...after.map((b) => b.h))) : null;
  // 비교 기준: 그날까지의 변동성만으로 그 가격에 닿을 확률(방향 없는 무작위) — 적중률이 이보다 높아야 '맞히는 편'
  const exp = f.exp ?? hitProb(bars.slice(0, i + 1), f.price, [horizon], down, { n: 2000 })?.mc[horizon] ?? null;
  return { status: st, dir: down ? '하락' : '상승', base, hit_day: hit?.d ?? null, best, exp };
}

// 판정 모음 요약: 적중 n/m, 변동성상 기대 적중 x/m
export function scoreText(list) {
  const done = list.filter((f) => f.status === 'hit' || f.status === 'miss');
  if (!done.length) return '';
  const hit = done.filter((f) => f.status === 'hit').length;
  const exp = done.reduce((a, f) => a + (f.exp ?? 0), 0);
  return `적중 ${hit}/${done.length}(${Math.round((hit / done.length) * 100)}%) · 무작위 기대 ${exp.toFixed(1)}/${done.length}(${Math.round((exp / done.length) * 100)}%)`;
}

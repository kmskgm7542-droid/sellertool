// 시세 수집 — 업비트 1시간봉(코인), 네이버 일봉(국내주식).
// 이 클라우드 환경에서는 프록시를 거치므로 NODE_USE_ENV_PROXY=1 로 실행해야 한다(README 참고).

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const iso = (sec) => new Date(sec * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');

async function get(url, as = 'json') {
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fetch(url, { headers: { accept: as === 'json' ? 'application/json' : '*/*' } });
    if (r.status === 429) { await sleep(1000 * (attempt + 1)); continue; }
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return as === 'json' ? r.json() : r.text();
  }
  throw new Error(`요청 한도 초과: ${url}`);
}

export async function upbitMarkets() {
  return get('https://api.upbit.com/v1/market/all?isDetails=false');
}

// [[t,o,h,l,c], ...] 오름차순, t = 봉 시작(UTC 유닉스초)
export async function upbitHourly(market, fromSec, toSec) {
  const byT = new Map();
  let to = iso(toSec);
  for (let guard = 0; guard < 1000; guard++) {
    const url = `https://api.upbit.com/v1/candles/minutes/60?market=${market}&count=200&to=${encodeURIComponent(to)}`;
    const rows = await get(url);
    if (!rows.length) break;
    for (const c of rows) {
      const t = Date.parse(`${c.candle_date_time_utc}Z`) / 1000;
      byT.set(t, [t, c.opening_price, c.high_price, c.low_price, c.trade_price]);
    }
    const oldest = Date.parse(`${rows[rows.length - 1].candle_date_time_utc}Z`) / 1000;
    if (oldest <= fromSec) break;
    to = iso(oldest);
    await sleep(120);
  }
  return [...byT.values()].sort((a, b) => a[0] - b[0]);
}

// 네이버 일봉. t = 해당 날짜 KST 00:00
export async function naverDaily(code, count) {
  const url = `https://fchart.stock.naver.com/sise.nhn?symbol=${code}&timeframe=day&count=${count}&requestType=0`;
  const txt = await get(url, 'text');
  const rows = [];
  for (const m of txt.matchAll(/data="(\d{8})\|([\d.]+)\|([\d.]+)\|([\d.]+)\|([\d.]+)\|/g)) {
    const d = m[1];
    const t = Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8)) / 1000 - 9 * 3600;
    rows.push([t, +m[2], +m[3], +m[4], +m[5]]);
  }
  return rows.sort((a, b) => a[0] - b[0]);
}

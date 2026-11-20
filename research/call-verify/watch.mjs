// 관심종목 가격 확인·알림 — 예약작업 CallVerifyWatch 가 10분마다 실행(watch_hidden.vbs → watch_run.bat, 창 없이).
//   국내주식: 평일 09:00~15:40 에만 확인(네이버 현재가). 코인: 50분마다(업비트 현재가).
//   알림: 🟡 매수·기준선·돌파 3% 이내 접근 / 🟢 매수 구간 도달 / 🔴 손절·기준선 이탈 / 🎯 목표가 도달 / 🚀 돌파
//         같은 알림은 하루 한 번, 조건이 꺼졌다가 다시 켜질 때만 다시 보낸다.
//   봇 명령도 여기서 처리: 방송 대기·밤 실행 시간이 아니면 밀린 봇 메시지를 먼저 처리(관심종목 등록에 10분 안에 답장).
//   실행: node watch.mjs            (평소)
//         node watch.mjs --summary  (주간 현황표를 텔레그램으로 — weekly_run)
//         node watch.mjs --dry      (가격만 보고 알림·상태 저장 없음)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA, describe, evaluate, fmt, loadWatch, newAlerts, saveWatch } from './watchlist.mjs';
import { history, hitProb, loadForecasts, probText, scoreText } from './forecast.mjs';

const STATE = path.join(DATA, 'watch_state.json');
const LOG = path.join(DATA, 'watch.log');
const readJson = (f, d) => { try { return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d; } catch { return d; } };

// 한국 시각 { day(0=일), hm(분 단위), date }
export function kstNow(ms = Date.now()) {
  const d = new Date(ms + 9 * 3600000);
  return { day: d.getUTCDay(), hm: d.getUTCHours() * 60 + d.getUTCMinutes(), date: d.toISOString().slice(0, 10) };
}
export const krxOpen = (k) => k.day >= 1 && k.day <= 5 && k.hm >= 9 * 60 && k.hm <= 15 * 60 + 40;
// 다른 프로그램이 봇 메시지를 받는 시간(같이 받으면 텔레그램이 한쪽을 거절) — 이때는 봇 처리를 건너뛴다
export function botBusy(k) {
  if (k.day >= 1 && k.day <= 5 && k.hm >= 14 * 60 + 35 && k.hm <= 17 * 60) return true; // 방송 대기 14:40~16:50
  if (k.hm >= 21 * 60 + 20 && k.hm <= 22 * 60 + 50) return true; // 매일 21:30 실행, 일요일 22:00 주간 실행
  return false;
}

function log(line) {
  const prev = fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean) : [];
  fs.writeFileSync(LOG, [...prev, `${new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 16).replace('T', ' ')} ${line}`].slice(-400).join('\n') + '\n');
  console.log(line);
}

async function getJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
const num = (v) => Number(String(v).replace(/,/g, ''));

export async function fetchPrices(items) {
  const out = {};
  const coins = [...new Set(items.filter((x) => x.market === 'UPBIT').map((x) => x.symbol))];
  if (coins.length) {
    try {
      for (const t of await getJson(`https://api.upbit.com/v1/ticker?markets=${coins.join(',')}`)) out[`UPBIT:${t.market}`] = t.trade_price;
    } catch (e) { log(`업비트 시세 실패: ${e.message}`); }
  }
  for (const code of new Set(items.filter((x) => x.market === 'KRX').map((x) => x.symbol))) {
    try {
      const j = await getJson(`https://m.stock.naver.com/api/stock/${code}/basic`);
      out[`KRX:${code}`] = num(j.closePrice);
    } catch (e) {
      // 예비 경로: 네이버 차트 일봉의 마지막 봉 종가(장중에는 현재가) — fetch_prices.py 와 같은 주소
      try {
        const r = await fetch(`https://fchart.stock.naver.com/sise.nhn?symbol=${code}&timeframe=day&count=2&requestType=0`, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) });
        const rows = [...(await r.text()).matchAll(/data="\d{8}\|[\d.]+\|[\d.]+\|[\d.]+\|([\d.]+)\|/g)];
        if (!rows.length) throw new Error('빈 응답');
        out[`KRX:${code}`] = Number(rows[rows.length - 1][1]);
      } catch (e2) { log(`네이버 시세 실패 ${code}: ${e.message} / 예비 ${e2.message}`); }
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return out;
}

async function send(text) {
  const c = readJson(path.join(DATA, 'tg_bot.json'), null);
  if (!c?.token) { console.log('(봇 미설정 — 알림 생략)\n' + text); return false; }
  const r = await fetch(`https://api.telegram.org/bot${c.token}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: c.chat_id, text: text.slice(0, 4000) }), signal: AbortSignal.timeout(30000),
  });
  return (await r.json()).ok;
}

const gap = (price, level) => `${price >= level ? '+' : ''}${(((price - level) / level) * 100).toFixed(1)}%`;
// 다음에 볼 가격까지 도달 확률 한 줄 — 매수 구간 위면 매수 상단, 구간 안이면 손절(아래)·첫 목표(위), 기준선·돌파가
async function reachLine(it, p) {
  if (!(p > 0)) return '';
  const lv = [];
  if (it.buy && p > it.buy[1]) lv.push(['매수 상단', it.buy[1], true]);
  else if (it.buy) {
    if (it.stop?.length) lv.push(['손절', Math.max(...it.stop), true]);
    if (it.targets?.length) lv.push(['목표', it.targets.find((t) => t > p) ?? it.targets[it.targets.length - 1], false]);
  }
  if (it.line && p > it.line) lv.push(['기준선', it.line, true]);
  if (it.breakout && p < it.breakout) lv.push(['돌파', it.breakout, false]);
  if (!it.buy && !it.line && !it.breakout && it.targets?.length) { const t = it.targets.find((x) => x > p); if (t) lv.push(['목표', t, false]); }
  if (!lv.length) return '';
  const bars = await history(it.market, it.symbol, 300);
  const hz = it.market === 'KRX' ? [20, 60] : [30, 90];
  const unit = it.market === 'KRX' ? '거래일' : '일';
  return lv.map(([lab, v, down]) => {
    if ((down && p <= v) || (!down && p >= v)) return `${lab} ${fmt(v)}: 이미 도달`;
    return `${lab} ${fmt(v)}까지 도달 확률 ${probText(hitProb(bars, v, hz, down), hz, unit)}`;
  }).join(' / ');
}

function statusLine(it, p) {
  if (!(p > 0)) return `· ${describe(it)} — 시세 없음`;
  const ref = it.buy ? it.buy[1] : it.line ?? it.breakout;
  return `· ${describe(it)} — 현재 ${fmt(p)}${ref ? ` (${it.buy ? '매수가' : it.line ? '기준선' : '돌파가'} 대비 ${gap(p, ref)})` : ''}`;
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const summary = args.includes('--summary');
  const k = kstNow();
  // 실행 흔적(건강검진이 '예약작업이 돌고 있나'를 이 파일 시각으로 본다 — 장 시간이 아니어서 확인할 게 없어도 갱신)
  if (!dry && !summary) { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(path.join(DATA, 'watch_heartbeat.txt'), new Date().toISOString()); }
  // 1) 밀린 봇 메시지(관심종목 등록 등) 먼저 — 바로 다음 가격 확인에 반영
  if (!dry && !summary && !botBusy(k) && fs.existsSync(path.join(DATA, 'tg_bot.json'))) {
    try { const { runBot } = await import('./live.mjs'); await runBot(0); } catch (e) { log(`봇 처리 실패: ${e.message}`); }
  }
  const w = loadWatch();
  const active = w.items.filter((x) => x.status !== 'closed' && x.market && x.symbol);
  if (!active.length) { console.log('관심종목 없음'); return; }

  if (summary) {
    const px = await fetchPrices(active);
    const rows = [];
    for (const t of ['장투', '대기', '관심']) {
      const g = active.filter((x) => x.tier === t);
      if (!g.length) continue;
      rows.push(`[${t}]`);
      for (const x of g) {
        const p = px[`${x.market}:${x.symbol}`];
        rows.push(statusLine(x, p).replace(` [${t}]`, ''));
        const pr = await reachLine(x, p).catch(() => '');
        if (pr) rows.push(`   ${pr}`);
      }
    }
    // 방송 가격 예측 적중(자동 기록, 참고용) — 무작위 기대보다 높아야 맞히는 편
    const fc = loadForecasts().items;
    const fcRows = [...new Set(fc.map((f) => f.name))].map((n) => {
      const sc = scoreText(fc.filter((f) => f.name === n));
      const pend = fc.filter((f) => f.name === n && f.status === 'pending').length;
      return sc || pend ? `· ${n}: ${sc || '판정 전'}${pend ? ` · 기한 남은 예측 ${pend}건` : ''}` : '';
    }).filter(Boolean);
    const fcText = fcRows.length ? `\n\n🎯 방송 가격 예측 적중(주식 20거래일·코인 30일 안, 자동 기록)\n· 전체: ${scoreText(fc) || '판정 전'}\n${fcRows.join('\n')}` : '';
    const text = `⭐ 관심종목 주간 현황 ${k.date}\n${rows.join('\n')}${fcText}${w.candidates.length ? `\n\n승인 대기 강조 후보 ${w.candidates.length}건 — "관심 후보"` : ''}\n※ 도달 확률은 날짜 예측이 아니라 가능성 범위(변동성 기준~과거 실제 빈도). 방송·게시판에서 말한 가격 기록일 뿐 매수 신호가 아닙니다.`;
    if (dry) console.log(text); else log(`주간 현황 전송: ${await send(text)}`);
    return;
  }

  const state = readJson(STATE, {});
  const coinDue = !state.lastCoin || Date.now() - state.lastCoin >= 50 * 60000;
  const todo = active.filter((x) => (x.market === 'KRX' ? krxOpen(k) : coinDue));
  if (!todo.length) { console.log(`확인할 종목 없음(장 시간 아님${coinDue ? '' : ', 코인은 50분 간격'})`); return; }
  const px = await fetchPrices(todo);
  if (todo.some((x) => x.market === 'UPBIT')) state.lastCoin = Date.now();
  const alerts = [];
  for (const it of todo) {
    const p = px[`${it.market}:${it.symbol}`];
    if (!(p > 0)) continue;
    it.last_price = p;
    it.last_checked = new Date().toISOString();
    const fresh = newAlerts(state, `${it.market}:${it.symbol}`, evaluate(it, p), k.date);
    for (const c of fresh) alerts.push(`${c.icon} ${it.name} [${it.tier}] ${c.text} — 현재 ${fmt(p)}\n   ${describe(it).replace(`${it.name} [${it.tier}] `, '')}`);
  }
  log(`확인 ${todo.length}종목(주식 ${todo.filter((x) => x.market === 'KRX').length}·코인 ${todo.filter((x) => x.market === 'UPBIT').length}) · 새 알림 ${alerts.length}건`);
  if (dry) { console.log(alerts.join('\n') || '(새 알림 없음)'); return; }
  saveWatch(w);
  let ok = true;
  if (alerts.length) {
    try { ok = await send(`⭐ 관심종목 알림\n${alerts.join('\n')}\n※ 말한 가격에 왔다는 기록 알림입니다. 매수 신호 아님.`); } catch (e) { ok = false; log(`알림 전송 실패: ${e.message}`); }
    log(`알림 전송: ${ok}`);
  }
  // 전송에 실패하면 알림 상태를 저장하지 않는다 → 다음 확인 때 다시 보낸다
  if (ok) fs.writeFileSync(STATE, JSON.stringify(state));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { log(`✖ ${e.message}`); process.exit(1); });
}

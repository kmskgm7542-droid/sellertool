// 성적표를 파일 하나(data/report.html)로 만든다 — 호스팅·로그인 없이 텔레그램으로 받아 휴대폰·PC 브라우저에서 바로 연다.
//   node report_html.mjs            data/results.json → data/report.html (+ data/history_local.json 에 주차 요약 누적)
//   내용은 웹페이지(/calls)와 같다: 판정 카드, 자산 곡선, 보유중, 콜 목록, 시장별·채널별, 검토 필요, 규칙.
//   콜 원문(유료 콘텐츠)은 넣지 않는다. 숫자·종목·결과만.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(HERE, 'data');
const SRC = path.join(DATA, 'results.json');
const OUT = path.join(DATA, 'report.html');
const HIST = path.join(DATA, 'history_local.json');

const n = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const fx = (x, d = 2) => (x === 'inf' ? '∞' : n(x) === null ? '-' : n(x).toFixed(d));
const pct = (x, d = 1) => (n(x) === null ? '-' : `${(n(x) * 100).toFixed(d)}%`);
const signedR = (x, d = 1) => (n(x) === null ? '-' : `${n(x) >= 0 ? '+' : ''}${n(x).toFixed(d)}R`);
const kst = (sec, withTime = true) => {
  if (!sec) return '-';
  const s = new Date((sec + 9 * 3600) * 1000).toISOString();
  return withTime ? `${s.slice(5, 10)} ${s.slice(11, 16)}` : s.slice(0, 10);
};
const kstIso = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : kst(d.getTime() / 1000); };
const price = (p, market) => {
  if (p === null || p === undefined || !Number.isFinite(p)) return '-';
  if (market === 'KRX' || p >= 1000) return Math.round(p).toLocaleString('ko-KR');
  if (p >= 1) return p.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
  return p.toLocaleString('ko-KR', { maximumFractionDigits: 4 });
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STATUS = { FILLED: '종료', OPEN: '보유중', UNFILLED: '미체결', SKIPPED: '제외', NO_DATA: '시세없음' };
const MODE = { MARKET: '시장가', MARKET_CLOSE: '당일종가', LIMIT: '지정가', BREAKOUT: '돌파' };
const MARKET = { KRX: '국내주식', UPBIT: '업비트' };
const reasonLabel = (r) => (!r ? '' : r === 'DATA_END' ? '보유중' : r === 'EXPIRY' ? '기간만료' : r === 'SL_SAMEDAY' ? '당일손절' : r === 'SL_CLOSE' ? '종가손절' : r === 'SL_GAP' ? '갭손절' : r === 'SL' ? '손절' : /^TP\d/.test(r) ? `${r.slice(2)}차 목표` : r);
const outcome = (c) => (c.status === 'OPEN' ? `보유중 ${signedR(c.R)}` : c.status !== 'FILLED' ? (STATUS[c.status] ?? c.status) : /^SL/.test(c.lastReason ?? '') ? `손절 ${signedR(c.R)}` : /^TP/.test(c.lastReason ?? '') ? `목표 ${signedR(c.R)}` : `만료 ${signedR(c.R)}`);
const tone = (v) => (v.startsWith('합격') ? 'pass' : v.startsWith('불합격') ? 'fail' : 'na');

// 체결 50건까지 남은 주 수: 최근 주차 요약의 체결 증가 속도, 없으면 첫 콜 이후 평균 속도
export function estimateWeeksToTarget(s, history) {
  const need = Number(s.rules.CRITERIA.minFilled ?? 50);
  const filled = s.stats.A.filled;
  if (filled >= need) return 0;
  let perWeek = null;
  const recent = history.slice(-5);
  if (recent.length >= 2) {
    const gained = recent[recent.length - 1].filled - recent[0].filled;
    if (gained > 0) perWeek = gained / (recent.length - 1);
  }
  if (perWeek === null) {
    const first = Math.min(...s.calls.map((c) => c.postedAt).filter(Boolean));
    const weeks = Math.max(1, (Date.parse(s.generatedAt) / 1000 - first) / (7 * 86400));
    if (filled > 0 && Number.isFinite(weeks)) perWeek = filled / weeks;
  }
  return !perWeek || perWeek <= 0 ? null : Math.ceil((need - filled) / perWeek);
}

function gauge(key, c) {
  const v = n(c.value);
  const num = Number(String(c.need).replace(/[^\d.-]/g, ''));
  let text = '-'; let ratio = 0;
  if (key === '표본') { text = `${v ?? 0} / ${num}`; ratio = v === null ? 0 : v / num; }
  else if (key === '기대값') { text = `${fx(c.value)}R`; ratio = v === null ? 0 : v > 0 ? 1 : 0; }
  else if (key === 't값') { text = `${fx(c.value)} / ${num}`; ratio = v === null ? 0 : v / num; }
  else if (key === 'PF') { text = `${fx(c.value)} / ${num}`; ratio = c.value === 'inf' ? 1 : v === null ? 0 : v / num; }
  else if (key === '최대낙폭') { text = `${pct(c.value)} (한도 ${num}%)`; ratio = v === null ? 0 : 1 - Math.min(1, Math.abs(v) / Math.abs(num / 100)); }
  else { text = `${fx(c.value)} (${esc(c.need)})`; ratio = c.pass ? 1 : 0; }
  return { text, ratio: Math.max(0, Math.min(1, ratio)) };
}

// 자산 곡선 SVG(A 실선, B 점선). 라이브러리 없이 그린다.
export function equitySvg(eqA, eqB) {
  const W = 640, H = 220, L = 44, R = 12, T = 12, B = 28;
  const pts = (eq) => eq.map((p, i) => ({ x: i, y: p.v }));
  const a = pts(eqA); const b = pts(eqB);
  const all = [...a, ...b];
  if (all.length < 2) return '<p class="muted">체결 종료 거래가 2건 이상 쌓이면 자산 곡선이 그려집니다.</p>';
  const xmax = Math.max(a.length, b.length) - 1;
  const ymin = Math.min(1, ...all.map((p) => p.y)) * 0.995;
  const ymax = Math.max(1, ...all.map((p) => p.y)) * 1.005;
  const X = (x) => L + (x / Math.max(1, xmax)) * (W - L - R);
  const Y = (y) => T + (1 - (y - ymin) / Math.max(1e-9, ymax - ymin)) * (H - T - B);
  const line = (ps) => ps.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ');
  const ticks = [ymin, 1, ymax].filter((v, i, arr) => arr.indexOf(v) === i).sort((p, q) => p - q);
  const grid = ticks.map((v) => `<line x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="grid"/><text x="${L - 6}" y="${(Y(v) + 4).toFixed(1)}" class="tick" text-anchor="end">${(v * 100).toFixed(1)}%</text>`).join('');
  const area = `M${X(0).toFixed(1)},${Y(1).toFixed(1)} ${a.map((p) => `L${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ')} L${X(a.length - 1).toFixed(1)},${Y(1).toFixed(1)} Z`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="자산 곡선">
    ${grid}
    <path d="${area}" class="area"/>
    <path d="${line(a)}" class="lineA"/>
    ${b.length > 1 ? `<path d="${line(b)}" class="lineB"/>` : ''}
    <text x="${W - R}" y="${H - 8}" class="tick" text-anchor="end">종료 거래 수 →</text>
    <text x="${L}" y="${H - 8}" class="tick">시작 100%</text>
  </svg>
  <p class="legend"><span class="swA"></span>A안 전체 콜 <span class="swB"></span>B안 정밀 시각 콜만</p>`;
}

// 월별 적중율(종료 콜 기준) — 웹의 '기간별 적중율'과 같은 계산의 월별·전체 표
function monthlyTable(calls) {
  const m = new Map();
  for (const c of calls) {
    if (!c.postedAt) continue;
    const d = new Date((c.postedAt + 9 * 3600) * 1000);
    const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const b = m.get(k) ?? { calls: 0, filled: 0, open: 0, wins: 0, sum: 0, pos: 0, neg: 0 };
    b.calls += 1;
    if (c.status === 'OPEN') b.open += 1;
    if (c.status === 'FILLED' && typeof c.R === 'number' && Number.isFinite(c.R)) {
      b.filled += 1; b.sum += c.R; if (c.R > 0) { b.wins += 1; b.pos += c.R; } else b.neg -= c.R;
    }
    m.set(k, b);
  }
  const rows = [...m.entries()].sort((x, y) => y[0].localeCompare(x[0]));
  if (!rows.length) return '';
  return `<section><h2>월별 적중율 <span class="muted small">(게시 월 기준, 종료 콜)</span></h2><div class="scroll"><table><thead><tr><th>월</th><th>콜</th><th>종료</th><th>승률</th><th>평균R</th><th>합계R</th><th>PF</th><th>보유중</th></tr></thead><tbody>
  ${rows.map(([k, b]) => `<tr><td>${k}</td><td>${b.calls}</td><td>${b.filled}${b.filled < 5 ? ' <span class="muted small">(참고)</span>' : ''}</td><td>${b.filled ? pct(b.wins / b.filled) : '-'}</td><td>${b.filled ? fx(b.sum / b.filled) : '-'}</td><td class="${b.sum > 0 ? 'pos' : b.sum < 0 ? 'neg' : ''}">${b.filled ? signedR(b.sum) : '-'}</td><td>${b.neg > 0 ? fx(b.pos / b.neg) : b.pos > 0 ? '∞' : '-'}</td><td>${b.open || '-'}</td></tr>`).join('')}
  </tbody></table></div></section>`;
}

function statsTable(title, groups, labelOf = (k) => k) {
  const rows = Object.entries(groups);
  if (!rows.length) return '';
  return `<section><h2>${title}</h2><div class="scroll"><table><thead><tr><th>구분</th><th>콜</th><th>체결</th><th>승률</th><th>평균R</th><th>PF</th><th>MDD</th><th>판정</th></tr></thead><tbody>
  ${rows.map(([k, s]) => `<tr><td>${esc(labelOf(k))}</td><td>${s.calls}</td><td>${s.filled}</td><td>${pct(s.winRate)}</td><td>${fx(s.meanR)}</td><td>${fx(s.pf)}</td><td>${pct(s.mdd)}</td><td class="${tone(s.verdict)}">${esc(s.verdict)}</td></tr>`).join('')}
  </tbody></table></div></section>`;
}

export function render(s, history) {
  const a = s.stats.A;
  const t = tone(a.verdict);
  const eta = estimateWeeksToTarget(s, history);
  const need = Number(s.rules.CRITERIA.minFilled ?? 50);
  const calls = [...s.calls].sort((p, q) => (q.postedAt ?? 0) - (p.postedAt ?? 0));
  const open = calls.filter((c) => c.status === 'OPEN');
  const asOf = Math.max(0, ...s.calls.map((c) => c.last?.t ?? 0));
  const checks = Object.entries(a.checks ?? {}).map(([k, c]) => {
    const g = gauge(k, c);
    return `<li><div class="row"><b>${c.pass ? '✅' : '⬜'} ${esc(k)}</b><span class="muted">${esc(g.text)}</span></div><div class="bar"><div class="${c.pass ? 'ok' : 'warn'}" style="width:${(g.ratio * 100).toFixed(0)}%"></div></div></li>`;
  }).join('');
  const callRows = calls.map((c) => `<tr>
    <td>${kst(c.postedAt)}</td><td>${esc(c.channel)}</td><td><b>${esc(c.name || c.symbol)}</b><div class="muted small">${MARKET[c.market] ?? esc(c.market)} · ${MODE[c.entryMode] ?? esc(c.entryMode)}</div></td>
    <td class="num">${c.entryMode === 'MARKET' || c.entryMode === 'MARKET_CLOSE' ? (c.fillPrice ? price(c.fillPrice, c.market) : '현재가') : price(c.entry, c.market)}</td>
    <td class="num">${price(c.sl, c.market)}</td><td class="num">${(c.tps ?? []).map((p) => price(p, c.market)).join(' / ') || '-'}</td>
    <td class="${c.status === 'FILLED' || c.status === 'OPEN' ? (n(c.R) >= 0 ? 'pos' : 'neg') : 'muted'}">${esc(outcome(c))}${c.exitAt ? `<div class="muted small">${kst(c.exitAt, false)} ${esc(reasonLabel(c.lastReason))}</div>` : ''}</td>
  </tr>`).join('');
  const openRows = open.map((c) => `<tr><td>${kst(c.postedAt)}</td><td><b>${esc(c.name || c.symbol)}</b> <span class="muted small">${MARKET[c.market] ?? ''}</span></td><td class="num">${price(c.fillPrice, c.market)}</td><td class="num">${c.last ? price(c.last.close, c.market) : '-'}</td><td class="num">${price(c.sl, c.market)}</td><td class="${n(c.R) >= 0 ? 'pos' : 'neg'}">${signedR(c.R)}</td></tr>`).join('');
  const pending = (s.pending ?? []).map((p) => `<li><b>${esc(p.name)}</b> <span class="muted">${esc(p.t)}</span> — ${esc(p.why)}</li>`).join('');
  const R = s.rules.RULES ?? {}; const C = s.rules.COSTS ?? {}; const CR = s.rules.CRITERIA ?? {};
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>콜 검증 성적표 ${esc(s.week)}</title>
<style>
:root{--bg:#f7f7f8;--card:#fff;--fg:#111;--muted:#667;--line:#e3e4e8;--pass:#1b8a4c;--fail:#c0392b;--na:#777;--passbg:#e8f6ee;--failbg:#fbe9e7;--nabg:#eee;--acc:#2563eb}
@media (prefers-color-scheme:dark){:root{--bg:#0f1115;--card:#171a21;--fg:#e8e8ea;--muted:#9aa;--line:#2a2e38;--passbg:#113322;--failbg:#3a1a16;--nabg:#262a33;--acc:#60a5fa}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 -apple-system,"Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif}
main{max-width:900px;margin:0 auto;padding:16px}h1{font-size:20px;margin:0 0 4px}h2{font-size:16px;margin:0 0 10px}
section{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px;margin:12px 0}
.verdict{border-width:2px}.verdict.pass{border-color:var(--pass);background:var(--passbg)}.verdict.fail{border-color:var(--fail);background:var(--failbg)}.verdict.na{border-color:var(--na);background:var(--nabg)}
.verdict h2{font-size:22px}.muted{color:var(--muted)}.small{font-size:12px}.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.pos{color:var(--pass);font-weight:600}.neg{color:var(--fail);font-weight:600}.pass{color:var(--pass)}.fail{color:var(--fail)}.na{color:var(--na)}
ul.checks{list-style:none;padding:0;margin:10px 0 0;display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
ul.checks li{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px}.row{display:flex;justify-content:space-between;font-size:13px;gap:8px}
.bar{height:6px;background:var(--line);border-radius:3px;margin-top:6px;overflow:hidden}.bar div{height:100%}.bar .ok{background:var(--pass)}.bar .warn{background:#d98b00}
svg{width:100%;height:auto;display:block}.grid{stroke:var(--line);stroke-width:1}.tick{fill:var(--muted);font-size:11px}.area{fill:var(--acc);opacity:.12}.lineA{fill:none;stroke:var(--acc);stroke-width:2}.lineB{fill:none;stroke:var(--muted);stroke-width:1.5;stroke-dasharray:4 3}
.legend{font-size:12px;color:var(--muted);margin:6px 0 0}.swA,.swB{display:inline-block;width:14px;height:3px;vertical-align:middle;margin:0 4px 0 8px;background:var(--acc)}.swB{background:var(--muted)}
.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:13px}th,td{padding:7px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{color:var(--muted);font-weight:600;white-space:nowrap}
.kv{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:0}.kv div{background:var(--bg);border-radius:8px;padding:8px}.kv b{display:block;font-size:18px}
footer{color:var(--muted);font-size:12px;margin:16px 0}
</style></head><body><main>
<h1>콜 검증 성적표 <span class="muted">${esc(s.week)}</span></h1>
<p class="muted small">생성 ${kstIso(s.generatedAt)} KST · 원장 ${s.counts.ledger}건 · 검증 대상 ${s.counts.usable}건 · 제외 ${s.counts.excluded}건${asOf ? ` · 시세 기준 ${kst(asOf)}` : ''}</p>

<section class="verdict ${t}">
  <div class="row"><h2>${esc(a.verdict)}</h2><span class="small">A안 · 전체 콜 기준</span></div>
  <p style="margin:4px 0 0">체결 ${a.filled}건 · 승률 ${pct(a.winRate)} · 평균 ${fx(a.meanR)}R · PF ${fx(a.pf)} · MDD ${pct(a.mdd)}${a.requiredN ? ` · t≥2까지 필요 표본 ${a.requiredN}` : ''}</p>
  <ul class="checks">${checks}</ul>
  <p class="small" style="margin:10px 0 0">${eta === 0 ? '표본 목표 도달.' : eta === null ? '체결 속도를 아직 추정할 수 없습니다.' : `현재 속도면 체결 ${need}건까지 약 ${eta}주.`} 합격 후에도 4~8주 전향 확인 → 페이퍼 → 소액 순서. <b>워크포워드 합격 전 실거래 금지.</b></p>
</section>

<section><h2>요약 지표</h2><div class="kv">
  <div><span class="muted small">체결 / 미체결 / 제외</span><b>${a.filled} / ${a.unfilled} / ${a.skipped}</b></div>
  <div><span class="muted small">승률</span><b>${pct(a.winRate)}</b></div>
  <div><span class="muted small">평균 R / 중앙값</span><b>${fx(a.meanR)} / ${fx(a.medianR)}</b></div>
  <div><span class="muted small">PF / t값</span><b>${fx(a.pf)} / ${fx(a.t)}</b></div>
  <div><span class="muted small">최대낙폭</span><b>${pct(a.mdd)}</b></div>
  <div><span class="muted small">최종 자산(시작 1)</span><b>${fx(a.finalEquity, 3)}</b></div>
  <div><span class="muted small">평균 보유일</span><b>${fx(a.avgHoldDays, 1)}</b></div>
  <div><span class="muted small">B안(정밀 시각 콜만)</span><b>${a === s.stats.B ? '-' : `${s.stats.B.filled}건 · ${pct(s.stats.B.winRate)} · ${fx(s.stats.B.meanR)}R`}</b></div>
</div></section>

<section><h2>자산 곡선 <span class="muted small">(손절 시 계좌 ${pct(CR.riskPerTrade ?? 0.01, 0)} 손실 기준 복리)</span></h2>${equitySvg(s.equity.A ?? [], s.equity.B ?? [])}</section>

${open.length ? `<section><h2>보유중 ${open.length}건</h2><div class="scroll"><table><thead><tr><th>게시</th><th>종목</th><th class="num">체결가</th><th class="num">현재</th><th class="num">손절</th><th>평가</th></tr></thead><tbody>${openRows}</tbody></table></div></section>` : ''}

<section><h2>콜 목록 ${calls.length}건</h2><div class="scroll"><table><thead><tr><th>게시(KST)</th><th>채널</th><th>종목</th><th class="num">진입</th><th class="num">손절</th><th class="num">목표</th><th>결과</th></tr></thead><tbody>${callRows}</tbody></table></div></section>

${monthlyTable(s.calls)}
${statsTable('시장별', s.byMarket ?? {}, (k) => MARKET[k] ?? k)}
${statsTable('채널별', s.byChannel ?? {})}

${pending ? `<section><h2>검토 필요 ${s.pending.length}건 <span class="muted small">(목표가·종목 등 미확정 — 봇에 수정 입력)</span></h2><ul>${pending}</ul></section>` : ''}

<section><h2>적용 규칙</h2><p class="small muted">진입 ±${((R.entryTolerance ?? 0.01) * 100).toFixed(0)}% 이내 시장가, 미도달 ${R.entryWindowDays ?? 5}일 후 미체결 · 기본 기간 ${R.defaultHorizonDays ?? 14}일 · 손절 기준은 콜 명시(없으면 터치) · 같은 봉 동시 도달은 손절 우선 · 장 마감 ${R.dailyFillCutoffHours ? `${Math.floor(R.dailyFillCutoffHours)}:${String(Math.round((R.dailyFillCutoffHours % 1) * 60)).padStart(2, '0')}` : '15:20'} 이후 콜은 다음 거래일 체결 · 비용 업비트 편도 ${((C.upbit ?? 0.0015) * 100).toFixed(2)}%, 국내주식 매수 ${((C.krxBuy ?? 0.00215) * 100).toFixed(3)}% 매도 ${((C.krxSell ?? 0.00415) * 100).toFixed(3)}% · 합격 기준 체결 ${need}건↑, 기대값>0, t≥${CR.minT ?? 2}, PF≥${CR.minPF ?? 1.3}, MDD≤${pct(CR.maxMDD ?? 0.2, 0)}</p></section>

<footer>본인 검증용 자료. 콜 원문은 포함하지 않으며 재배포하지 않습니다.</footer>
</main></body></html>`;
}

function main() {
  if (!fs.existsSync(SRC)) { console.log('data/results.json 이 없습니다. 먼저 node run.mjs sim 을 실행하세요.'); process.exit(1); }
  const s = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  let history = [];
  try { history = JSON.parse(fs.readFileSync(HIST, 'utf8')); } catch { /* 처음 */ }
  const a = s.stats.A;
  const day = new Date(Date.parse(s.generatedAt) + 9 * 3600 * 1000).toISOString().slice(0, 10); // KST 날짜 — 하루 한 줄
  const entry = { week: s.week, day, generatedAt: s.generatedAt, usable: s.counts.usable, filled: a.filled, winRate: a.winRate, meanR: a.meanR, t: a.t, pf: a.pf, mdd: a.mdd, verdict: a.verdict };
  const keyOf = (h) => h.day ?? h.week;
  history = [...history.filter((h) => keyOf(h) !== day), entry].sort((p, q) => keyOf(p).localeCompare(keyOf(q))).slice(-400);
  fs.writeFileSync(HIST, JSON.stringify(history, null, 1));
  fs.writeFileSync(OUT, render(s, history), 'utf8');
  console.log(`성적표 HTML → ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)}KB, 주차 누적 ${history.length}개)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

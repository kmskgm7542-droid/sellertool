// 콜 파서 · 시뮬레이터 · 통계 — 외부 의존성 없음.
// 규칙은 README.md "사전 확정 규칙"과 1:1로 대응한다.

export const HOUR = 3600;
export const DAY = 86400;

const NUM = String.raw`(\d+(?:\.\d+)?)`;
const UNIT = String.raw`\s*(만|천)?\s*원?`;

function toPrice(n, unit) {
  const v = Number(n);
  if (unit === '만') return v * 10000;
  if (unit === '천') return v * 1000;
  return v;
}

function blank(s, m) {
  return s.slice(0, m.index) + ' '.repeat(m[0].length) + s.slice(m.index + m[0].length);
}

// "25,000원" → "25000원", "2만5천" → "25000원"
export function normalizePrices(text) {
  let s = String(text);
  while (/(\d),(\d{3})/.test(s)) s = s.replace(/(\d),(\d{3})/, '$1$2');
  return s.replace(
    /(\d+(?:\.\d+)?)\s*만\s*(\d+(?:\.\d+)?)\s*천\s*원?/g,
    (_, a, b) => `${Number(a) * 10000 + Number(b) * 1000}원`,
  );
}

// ───────────────────────── 파서 ─────────────────────────

export function parseHorizon(text, rules) {
  const flags = [];
  let days = null;
  // "20일선", "5일 이평", "주봉" 같은 기술적 분석 용어는 기간이 아니다
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*(일|주|개월|달)(?!\s*(?:봉|선|이평|평균))/g)) {
    const n = Number(m[1]);
    const d = m[2] === '일' ? n : m[2] === '주' ? n * 7 : n * 30;
    days = Math.max(days ?? 0, d);
  }
  if (days == null) {
    if (/장기/.test(text)) days = rules.longDays;
    else if (/중기/.test(text)) days = rules.midDays;
    else if (/단기/.test(text)) days = rules.shortDays;
  }
  if (/(추석|설날|명절|연말|연초|실적|발표|이후)/.test(text)) {
    flags.push('기간이 이벤트 기준');
    days = Math.max(days ?? 0, rules.eventDays);
  }
  if (days == null) {
    flags.push('기간 표기 없음(기본값)');
    days = rules.defaultDays;
  }
  return { days, flags };
}

// 손절 판정 기준: 'CLOSE'(기준 봉 종가) 또는 'TOUCH'(봉 중간 터치)
export function parseStopBasis(text) {
  if (/주봉/.test(text) && /종가/.test(text)) {
    return { basis: 'CLOSE', hours: 24, flags: ['주봉 종가 기준은 미지원(일봉 종가로 대체)'] };
  }
  if (/(일봉|일\s*종가|하루)/.test(text) && /종가/.test(text)) return { basis: 'CLOSE', hours: 24, flags: [] };
  const h = text.match(/(\d+)\s*시간/);
  if (h) return { basis: 'CLOSE', hours: Number(h[1]), flags: [] };
  if (/종가/.test(text)) return { basis: 'CLOSE', hours: 24, flags: ['종가 기준이나 봉 미명시(일봉 적용)'] };
  return { basis: 'TOUCH', hours: null, flags: ['손절 기준 미명시(터치 적용)'] };
}

export function parseCall(text, rules) {
  const flags = [];
  const src = normalizePrices(text).replace(/\s+/g, ' ').trim();
  let w = src;

  // 진입
  let entry = null;
  let entryMode = null;
  const e = w.match(new RegExp(NUM + UNIT + String.raw`\s*(?:에\s*)?(?:매수|진입)`));
  if (e) {
    entry = toPrice(e[1], e[2]);
    entryMode = 'PRICE';
    w = blank(w, e);
  } else if (/현재가/.test(w)) {
    entryMode = 'MARKET';
  } else {
    flags.push('진입 정보 없음');
  }

  // 종목명: 해시태그 우선, 없으면 진입가 바로 앞 단어
  let name = null;
  const tag = src.match(/#([^\s#]+)/);
  if (tag) name = tag[1];
  else if (e) {
    const before = src.slice(0, e.index).trim().split(' ');
    name = before[before.length - 1] || null;
  }
  if (name) name = name.replace(/(을|를|은|는|이|가|도)$/, '');
  if (!name) flags.push('종목명 없음');

  // 손절
  let sl = null;
  const s = w.match(new RegExp(NUM + UNIT + String.raw`\s*(?:칼손절|손절|컷)`));
  if (s) {
    sl = toPrice(s[1], s[2]);
    w = blank(w, s);
  } else {
    flags.push('손절가 없음');
  }

  // 목표가: 범위 먼저, 그다음 단일가(단위 또는 '원'이 붙은 숫자만)
  const raw = [];
  const rangeRe = new RegExp(NUM + String.raw`\s*(만|천)?\s*원?\s*~\s*` + NUM + String.raw`\s*(만|천)?\s*원?`, 'g');
  for (const m of [...w.matchAll(rangeRe)]) {
    const lo = toPrice(m[1], m[2] ?? m[4]);
    const hi = toPrice(m[3], m[4]);
    raw.push({ price: rules.rangePick === 'mid' ? (lo + hi) / 2 : lo, range: [lo, hi] });
    flags.push(rules.rangePick === 'mid' ? '목표가 범위(중앙 적용)' : '목표가 범위(하단 적용)');
    w = blank(w, m);
  }
  for (const m of w.matchAll(new RegExp(NUM + String.raw`\s*(?:(만|천)\s*원?|원)`, 'g'))) {
    raw.push({ price: toPrice(m[1], m[2]) });
  }
  raw.sort((a, b) => a.price - b.price);
  const tps = raw.filter((t) => entry == null || t.price > entry);
  if (tps.length < raw.length) flags.push('진입가 이하 목표가 제외');
  if (!tps.length) flags.push('목표가 없음');
  tps.forEach((t) => (t.weight = 1 / tps.length));

  const hz = parseHorizon(src, rules);
  const sb = parseStopBasis(src);
  flags.push(...hz.flags, ...sb.flags);

  if (entry != null && sl != null && sl >= entry) flags.push('손절가가 진입가 이상');

  const ok = entryMode != null && sl != null && tps.length > 0 && !(entry != null && sl >= entry);
  return {
    ok,
    name,
    entryMode,
    entry,
    sl,
    tps,
    horizonDays: hz.days,
    stopBasis: sb.basis,
    stopHours: sb.hours,
    flags,
  };
}

// ─────────────────────── 시뮬레이터 ───────────────────────
// bars: [[t, o, h, l, c], ...] 시간 오름차순, t = 봉 시작 유닉스초(UTC)
// call: { tPost, entryMode, entry, sl, tps[{price,weight}], horizonDays, stopBasis, stopHours }

function isBasisClose(t, barSec, basisSec) {
  if (basisSec <= barSec) return true; // 일봉 데이터에 일봉 기준 → 모든 봉이 판정 봉
  return (t + barSec) % basisSec === 0; // 코인: UTC 00시 정렬(업비트 일봉 마감 = KST 09시)
}

export function simulate(call, bars, barSec, rules, cost, opts = {}) {
  const base = { id: call.id, market: call.market, stopBasis: call.stopBasis };
  const i0 = bars.findIndex((b) => b[0] >= call.tPost);
  if (i0 < 0) return { ...base, status: 'NO_DATA' };

  let prev = -1;
  for (let i = 0; i < bars.length && bars[i][0] + barSec <= call.tPost; i++) prev = i;
  const pPost = prev >= 0 ? bars[prev][4] : bars[i0][1];

  let mode = 'MARKET';
  if (call.entryMode === 'PRICE') {
    const d = (call.entry - pPost) / pPost;
    if (Math.abs(d) > rules.nearPct) mode = d < 0 ? 'LIMIT' : 'BREAKOUT';
  }

  const entryDeadline = call.tPost + rules.entryWindowDays * DAY;
  let j = -1;
  let pf = null;
  for (let i = i0; i < bars.length && bars[i][0] < entryDeadline; i++) {
    const [, o, h, l] = bars[i];
    if (mode === 'MARKET') { j = i; pf = o; break; }
    if (mode === 'LIMIT' && l <= call.entry) { j = i; pf = Math.min(o, call.entry); break; }
    if (mode === 'BREAKOUT' && h >= call.entry) { j = i; pf = Math.max(o, call.entry); break; }
  }
  if (j < 0) return { ...base, status: 'UNFILLED', mode, pPost };

  const tps = call.tps;
  if (pf <= call.sl) return { ...base, status: 'SKIPPED', reason: '진입 시점에 이미 손절가 이하', mode, pf };
  if (pf >= tps[0].price) return { ...base, status: 'SKIPPED', reason: '진입 시점에 이미 1차 목표 도달', mode, pf };

  const entryRef = call.entryMode === 'PRICE' ? call.entry : pf;
  const risk = (entryRef - call.sl) / entryRef;
  const basisSec = call.stopBasis === 'CLOSE' ? call.stopHours * HOUR : null;
  const holdDeadline = bars[j][0] + call.horizonDays * DAY;

  let sl = call.sl;
  let remaining = 1;
  let tpIdx = 0;
  const exits = [];
  const exit = (w, px, reason, t) => {
    exits.push({ w, px, reason, t });
    remaining -= w;
  };

  for (let k = j; k < bars.length && remaining > 1e-9; k++) {
    const [t, o, h, l, c] = bars[k];
    const fillBar = k === j;

    if (!fillBar && t >= holdDeadline) {
      const pb = bars[k - 1];
      exit(remaining, pb[4], 'EXPIRY', pb[0]);
      break;
    }

    if (call.stopBasis === 'TOUCH') {
      if (!fillBar && o <= sl) { exit(remaining, o, 'SL_GAP', t); break; }
      // 돌파 체결 봉의 저가는 대개 체결 전에 찍힌 값 → 종가로 체결 뒤 이탈이 확인될 때만 손절.
      // 그 외에는 같은 봉 목표·손절 동시 도달 시 손절 우선(보수적).
      const hitSL = fillBar && mode === 'BREAKOUT' ? c <= sl : l <= sl;
      if (hitSL) { exit(remaining, sl, 'SL', t); break; }
    }

    // 목표가(봉 중간 터치). 지정가·돌파 체결 봉에서는 체결 뒤 순서를 알 수 없어 익절을 세지 않는다.
    const canTP = !fillBar || mode === 'MARKET';
    while (canTP && tpIdx < tps.length && remaining > 1e-9 && h >= tps[tpIdx].price) {
      const px = !fillBar && o >= tps[tpIdx].price ? o : tps[tpIdx].price;
      const w = tpIdx === tps.length - 1 ? remaining : Math.min(tps[tpIdx].weight, remaining);
      exit(w, px, 'TP' + (tpIdx + 1), t);
      tpIdx++;
      if (opts.breakevenAfterTp1 && tpIdx === 1) sl = Math.max(sl, pf);
    }
    if (remaining <= 1e-9) break;

    // 종가 손절: 기준 봉 마감 시 종가 < 손절가 → 다음 봉 시가(설정) 청산
    if (call.stopBasis === 'CLOSE' && isBasisClose(t, barSec, basisSec) && c < sl) {
      const nb = bars[k + 1];
      if (rules.closeStopExit === 'nextOpen' && nb) exit(remaining, nb[1], 'SL_CLOSE', nb[0]);
      else exit(remaining, c, 'SL_CLOSE', t);
      break;
    }
  }

  let incomplete = false;
  if (remaining > 1e-9) {
    const lb = bars[bars.length - 1];
    exit(remaining, lb[4], 'DATA_END', lb[0]);
    incomplete = true;
  }

  const inCost = pf * (1 + cost.buy);
  const net = exits.reduce((a, x) => a + x.w * ((x.px * (1 - cost.sell)) / inCost - 1), 0);
  const tExit = Math.max(...exits.map((x) => x.t));
  return {
    ...base,
    status: 'FILLED',
    mode,
    pf,
    risk,
    net,
    R: net / risk,
    tFill: bars[j][0],
    tExit,
    holdDays: (tExit - bars[j][0]) / DAY,
    exits,
    lastReason: exits[exits.length - 1].reason,
    incomplete,
  };
}

// ───────────────────────── 통계 ─────────────────────────

export function stats(results, criteria) {
  const all = results.length;
  const count = (s) => results.filter((r) => r.status === s).length;
  const f = results.filter((r) => r.status === 'FILLED');
  const R = f.map((r) => r.R);
  const n = R.length;
  const mean = n ? R.reduce((a, b) => a + b, 0) / n : NaN;
  const sd = n > 1 ? Math.sqrt(R.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : NaN;
  const t = n > 1 && sd > 0 ? mean / (sd / Math.sqrt(n)) : NaN;
  const sorted = [...R].sort((a, b) => a - b);
  const median = n ? (n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2) : NaN;
  const gain = R.filter((x) => x > 0).reduce((a, b) => a + b, 0);
  const loss = R.filter((x) => x < 0).reduce((a, b) => a + b, 0);
  const pf = loss < 0 ? gain / -loss : gain > 0 ? Infinity : NaN;

  // 건당 리스크 고정 복리 곡선(청산 시각 순)
  let eq = 1;
  let peak = 1;
  let mdd = 0;
  for (const r of [...f].sort((a, b) => a.tExit - b.tExit)) {
    eq *= 1 + criteria.riskPerTrade * r.R;
    peak = Math.max(peak, eq);
    mdd = Math.min(mdd, eq / peak - 1);
  }

  // 최대 동시 보유
  const ev = f.flatMap((r) => [[r.tFill, 1], [r.tExit, -1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let cur = 0;
  let maxConc = 0;
  for (const [, d] of ev) { cur += d; maxConc = Math.max(maxConc, cur); }

  const reasons = {};
  for (const r of f) reasons[r.lastReason] = (reasons[r.lastReason] || 0) + 1;

  const needN = mean > 0 && sd > 0 ? Math.ceil(((criteria.minT * sd) / mean) ** 2) : null;
  const checks = {
    표본: { pass: n >= criteria.minFilled, value: n, need: `≥ ${criteria.minFilled}` },
    기대값: { pass: mean > 0, value: mean, need: '> 0 R' },
    t값: { pass: t >= criteria.minT, value: t, need: `≥ ${criteria.minT}` },
    PF: { pass: pf >= criteria.minPF, value: pf, need: `≥ ${criteria.minPF}` },
    최대낙폭: { pass: mdd >= criteria.maxDD, value: mdd, need: `≥ ${criteria.maxDD * 100}%` },
  };
  const verdict = !checks.표본.pass
    ? '판정 불가(표본 부족)'
    : Object.values(checks).every((c) => c.pass)
      ? '합격'
      : '불합격';

  return {
    calls: all,
    filled: n,
    unfilled: count('UNFILLED'),
    skipped: count('SKIPPED'),
    noData: count('NO_DATA'),
    fillRate: all ? n / all : NaN,
    winRate: n ? R.filter((x) => x > 0).length / n : NaN,
    meanR: mean,
    medianR: median,
    sdR: sd,
    t,
    pf,
    mdd,
    finalEquity: eq,
    maxConcurrent: maxConc,
    avgHoldDays: n ? f.reduce((a, r) => a + r.holdDays, 0) / n : NaN,
    exitReasons: reasons,
    incomplete: f.filter((r) => r.incomplete).length,
    requiredN: needN,
    checks,
    verdict,
  };
}

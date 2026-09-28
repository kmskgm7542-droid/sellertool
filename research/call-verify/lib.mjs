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

// 숫자 뒤에 이런 말이 붙으면 가격이 아니다(기간·비율·차트 용어)
const NOT_PRICE = String.raw`(?!\s*(?:%|퍼|배|번|개|명|일|주|개월|달|월|년|시간|분|봉|선|이평|파|차|층|k|K|불|달러|\$))`;
const P = NUM + String.raw`\s*(만|천)?\s*원?` + NOT_PRICE; // 가격 하나: [숫자, 단위]
// "매수유효" "매수가 안오면" "매수 유지" 는 진입 지시가 아니다
const ENTRY_WORD = String.raw`(?:분할\s*)?(?:매수|진입|롱)(?!\s*(?:유효|가\s*안|유지|하지\s*마|금지))`;
// 진입 앵커: "174매수" "16~15매수자리" "1850이하 매수진입" "185부근 매수" "현재가 매수"
const ENTRY_RE = new RegExp(
  String.raw`(?:` + P + String.raw`(?:\s*~\s*` + P + String.raw`)?\s*(?:이하|이상|부근|근처|대|정도|까지|위|아래)?\s*(?:에서|에|부터)?\s*` + ENTRY_WORD +
  String.raw`|현재가\s*(?:에서|에)?\s*` + ENTRY_WORD + String.raw`?)`,
  'g',
);
// 손절: "160이탈손절" "240이탈시 손절" "13천 칼손절" "480컷" "473원 일봉종가이탈컷" "손절 8%대 이하"(무시)
const SL_RE = new RegExp(P + String.raw`\s*(?:원)?\s*(?:[가-힣]{0,10}?)\s*(?:칼손절|손절가|손절|컷|스탑|이탈시\s*매도|이탈하면\s*매도)`);
const SL_RE2 = new RegExp(String.raw`(?:손절가|손절|컷)\s*(?:은|는|가|을|를|:)?\s*` + P);
// 목표: "목표는 230원" "목표 500정도" "31원익절" "400원봅니다" "4500원위에" "700원이상" "19천~2만도달"
const TP_RANGE_RE = new RegExp(P + String.raw`\s*~\s*` + P, 'g');
const TP_WORD_RE = new RegExp(P + String.raw`\s*(?:정도|대)?\s*(?:익절|목표|봅니다|보겠|볼수|볼\s*수|위에|이상|까지|노려|도달|가능|갈|간다|보고|보면)`, 'g');
const TP_LEAD_RE = new RegExp(String.raw`(?:목표가?|익절가?|익절은|목표는)\s*(?:은|는|가|:)?\s*` + P, 'g');
const TP_UNIT_RE = new RegExp(NUM + String.raw`\s*(?:(만|천)\s*원?|원)` + NOT_PRICE, 'g');

const strip = (s) => s.replace(/(을|를|은|는|이|가|도|만|의|에|로)$/, '');

function finishCall(seg, entryMode, entry, entryRange, name, rules, whole) {
  const flags = [];
  let w = seg;
  if (entryRange) flags.push('진입가 범위(보수적으로 위쪽 값 적용)');

  // 손절
  let sl = null;
  let s = w.match(SL_RE);
  if (!s) s = w.match(SL_RE2);
  if (s) {
    sl = toPrice(s[1], s[2]);
    w = blank(w, s);
  } else flags.push('손절가 없음');

  // 목표가 — "345원까지 매수유효" 같은 진입 상한은 목표가가 아니다
  const raw = [];
  for (const m of [...w.matchAll(new RegExp(P + String.raw`\s*까지\s*(?:분할\s*)?매수`, 'g'))]) w = blank(w, m);
  for (const m of [...w.matchAll(TP_RANGE_RE)]) {
    const lo = toPrice(m[1], m[2] ?? m[4]);
    const hi = toPrice(m[3], m[4]);
    raw.push({ price: rules.rangePick === 'mid' ? (lo + hi) / 2 : Math.min(lo, hi), range: [lo, hi] });
    flags.push(rules.rangePick === 'mid' ? '목표가 범위(중앙 적용)' : '목표가 범위(하단 적용)');
    w = blank(w, m);
  }
  for (const re of [TP_LEAD_RE, TP_WORD_RE]) {
    for (const m of [...w.matchAll(re)]) {
      raw.push({ price: toPrice(m[1], m[2]) });
      w = blank(w, m);
    }
  }
  for (const m of w.matchAll(TP_UNIT_RE)) raw.push({ price: toPrice(m[1], m[2]) });
  const seen = new Set();
  const uniq = raw.filter((t) => (seen.has(t.price) ? false : seen.add(t.price))).sort((a, b) => a.price - b.price);
  const above = entry != null ? entry : sl != null ? sl : 0;
  const tps = uniq.filter((t) => t.price > above);
  if (tps.length < uniq.length) flags.push('진입가 이하 목표가 제외');
  if (!tps.length) flags.push('목표가 없음');
  tps.forEach((t) => (t.weight = 1 / tps.length));

  const hz = parseHorizon(/(단기|중기|장기|\d\s*(?:일|주|개월))/.test(seg) ? seg : whole, rules);
  const sb = parseStopBasis(/종가|시간/.test(seg) ? seg : whole);
  flags.push(...hz.flags, ...sb.flags);
  if (/(불|달러|\$)/.test(seg)) flags.push('달러 표시(미지원)');
  if (entry != null && sl != null && sl >= entry) flags.push('손절가가 진입가 이상');
  if (!name) flags.push('종목명 없음');

  const ok = entryMode != null && sl != null && tps.length > 0 && !(entry != null && sl >= entry) && !/(불|달러|\$)/.test(seg);
  return { ok, name, entryMode, entry, sl, tps, horizonDays: hz.days, stopBasis: sb.basis, stopHours: sb.hours, flags, segment: seg };
}

// 한 글에 여러 종목의 콜이 있을 수 있다 → "매수" 앵커마다 하나의 콜로 자른다
export function parseCalls(text, rules) {
  const src = normalizePrices(text).replace(/https?:\/\/\S+/g, ' ').replace(/\s+/g, ' ').trim();
  const anchors = [...src.matchAll(ENTRY_RE)];
  if (!anchors.length) {
    const c = finishCall(src, null, null, false, (src.match(/#([^\s#]+)/) || [])[1] ?? null, rules, src);
    c.flags.unshift('진입 정보 없음');
    return [c];
  }
  const calls = [];
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    const segStart = i === 0 ? 0 : anchors[i - 1].index + anchors[i - 1][0].length;
    const segEnd = i + 1 < anchors.length ? anchors[i + 1].index : src.length;
    // 종목명: 앵커 바로 앞 단어(같은 문장 안), 없으면 해시태그
    const before = src.slice(segStart, a.index).trim().split(/[\s,·]+/).filter(Boolean);
    let name = null;
    for (let j = before.length - 1; j >= 0 && j >= before.length - 3; j--) {
      const cand = strip(before[j].replace(/^#/, ''));
      const stop = /^(오늘|내일|지금|다시|단타|단기|스윙|중기|장기|사생팬|회원|전용|현재가|여기|이건|그리고|또는|리스크|추세|눌림|돌파|매도|익절|손절|분할|자리|부근|및|등|약|각|그|이|저|더|좀|꼭|잘)$/;
      // 바로 앞 단어는 한 글자 종목명("넴")도 허용, 그 앞 단어는 두 글자 이상만
      const minLen = j === before.length - 1 ? 1 : 2;
      if (new RegExp(`^[가-힣A-Za-z][가-힣A-Za-z0-9]{${minLen - 1},}$`).test(cand) && !stop.test(cand)) {
        name = cand;
        break;
      }
    }
    if (!name) name = (src.match(/#([^\s#]+)/) || [])[1] ?? null;
    let entryMode;
    let entry = null;
    let range = false;
    if (a[1] != null) {
      entryMode = 'PRICE';
      const p1 = toPrice(a[1], a[2]);
      if (a[3] != null) {
        range = true;
        entry = Math.max(p1, toPrice(a[3], a[4]));
      } else entry = p1;
    } else entryMode = 'MARKET';
    const seg = src.slice(a.index + a[0].length, segEnd);
    calls.push(finishCall(seg, entryMode, entry, range, name, rules, src));
  }
  return calls;
}

export function parseCall(text, rules) {
  return parseCalls(text, rules)[0];
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

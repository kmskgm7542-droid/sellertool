#!/usr/bin/env node
// 사용법 (README 참고)
//   node run.mjs parse <텔레그램 result.json | 콜 텍스트.txt>   → data/ledger.draft.csv
//   (사람이 검토 후 data/ledger.csv 로 저장)
//   NODE_USE_ENV_PROXY=1 node run.mjs fetch                  → data/prices/*.json
//   node run.mjs sim                                          → 콘솔 요약 + data/report.md + data/results.csv
//
// data/ 폴더는 .gitignore 대상이다. 콜 원문(유료 콘텐츠)을 레포에 커밋하지 않는다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULES, COSTS, CRITERIA } from './config.mjs';
import { parseCalls, simulate, stats, DAY, HOUR } from './lib.mjs';
import { upbitMarkets, upbitHourly, naverDaily } from './fetch.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(HERE, 'data');
const PRICES = path.join(DATA, 'prices');

const COLS = [
  'id', 'channel', 't_post_kst', 't_post_unix', 'market', 'symbol', 'name', 'entry_mode', 'entry', 'sl',
  'tp1', 'tp2', 'tp3', 'horizon_days', 'stop_basis', 'stop_hours', 'ok', 'flags', 'text',
];

// ── CSV ──
const q = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
function writeCsv(file, cols, rows) {
  fs.writeFileSync(file, '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => q(r[c])).join(','))].join('\n'));
}
function readCsv(file) {
  const src = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let inQ = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQ) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((c) => c !== ''));
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

const kst = (sec) => new Date((sec + 9 * HOUR) * 1000).toISOString().replace('T', ' ').slice(0, 16);

// ── 입력 읽기: 텔레그램 JSON 또는 텍스트 ──
function loadMessages(file) {
  const raw = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  if (file.endsWith('.json')) {
    const j = JSON.parse(raw);
    return (j.messages || [])
      .filter((m) => m.type === 'message')
      .map((m) => ({
        id: m.post_id ? `yt${m.id}` : `tg${m.id}`,
        channel: m.channel ?? j.name ?? '',
        precision: m.date_precision ?? '',
        t: Number(m.date_unixtime) || Date.parse(m.date) / 1000,
        text: Array.isArray(m.text) ? m.text.map((x) => (typeof x === 'string' ? x : x.text)).join('') : String(m.text ?? ''),
      }));
  }
  // 텍스트: 빈 줄로 구분, 각 블록 첫 줄이 "YYYY-MM-DD HH:MM"(KST)
  return raw.split(/\n\s*\n/).map((b, i) => {
    const lines = b.trim().split('\n');
    const m = lines[0].match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    const t = m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) / 1000 - 9 * HOUR : NaN;
    return { id: `tx${i + 1}`, channel: '', t, text: (m ? lines.slice(1) : lines).join(' ') };
  });
}

async function cmdParse(file) {
  fs.mkdirSync(DATA, { recursive: true });
  const msgs = loadMessages(file).filter((m) => /(매수|진입|현재가)/.test(m.text) && /(손절|컷|스탑)/.test(m.text));
  // 종목 목록: markets.bat 이 받아둔 파일 우선, 없으면 업비트 API 시도
  const upbit = new Map();
  const krx = new Map();
  const upFile = path.join(DATA, 'upbit_markets.json');
  const krxFile = path.join(DATA, 'krx_list.json');
  if (fs.existsSync(upFile)) for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(upFile, 'utf8')))) upbit.set(k, v);
  else {
    try {
      for (const x of await upbitMarkets()) if (x.market.startsWith('KRW-')) upbit.set(x.korean_name, x.market);
    } catch {
      console.log('⚠ 업비트 종목 목록이 없습니다(markets.bat 실행 또는 검토 단계에서 직접 입력).');
    }
  }
  if (fs.existsSync(krxFile)) for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(krxFile, 'utf8')))) krx.set(k, v);
  const lookup = (name) => {
    if (!name) return null;
    if (/^\d{6}$/.test(name)) return ['KRX', name];
    if (upbit.has(name)) return ['UPBIT', upbit.get(name)];
    if (krx.has(name)) return ['KRX', krx.get(name)];
    // 부분 일치(예: "엑시" → "엑시인피니티"): 유일할 때만
    const up = [...upbit.keys()].filter((k) => k.startsWith(name) || name.startsWith(k));
    if (up.length === 1) return ['UPBIT', upbit.get(up[0])];
    const kr = [...krx.keys()].filter((k) => k.startsWith(name) || name.startsWith(k));
    if (kr.length === 1) return ['KRX', krx.get(kr[0])];
    return null;
  };
  // 사생팬알림방 사진 알림 시각(정확) → 같은 날(KST) 유튜브 글의 시각으로 대입
  const alertsByDay = new Map();
  const tgFile = path.join(DATA, 'result.json');
  if (fs.existsSync(tgFile)) {
    try {
      for (const a of JSON.parse(fs.readFileSync(tgFile, 'utf8')).messages || []) {
        if (!/사생팬/.test(a.channel || '')) continue;
        const t = Number(a.date_unixtime);
        const day = kst(t).slice(0, 10);
        alertsByDay.set(day, Math.min(alertsByDay.get(day) ?? Infinity, t));
      }
    } catch { /* 알림 파일이 깨져도 파싱은 계속 */ }
  }
  const rows = [];
  for (const m of msgs) {
    if (m.id.startsWith('yt') && ['day', 'hour'].includes(m.precision) && Number.isFinite(m.t)) {
      const t = alertsByDay.get(kst(m.t).slice(0, 10));
      if (t) { m.t = t; m.precision = 'alert'; }
    }
    const calls = parseCalls(m.text, RULES);
    calls.forEach((p, i) => {
      const flags = [...p.flags];
      const hit = lookup(p.name);
      const [market, symbol] = hit ?? ['', ''];
      if (!hit) flags.push('시장·종목코드 입력 필요');
      if (!Number.isFinite(m.t) || !m.t) flags.push('게시 시각 없음');
      if (['week', 'month', 'year', 'unknown'].includes(m.precision)) flags.push(`게시 시각 부정확(${m.precision})`);
      if (m.precision === 'alert') flags.push('시각=사생팬 알림');
      else if (m.precision === 'day') flags.push('시각=일 단위(12:00 가정)');
      rows.push({
        id: calls.length > 1 ? `${m.id}-${i + 1}` : m.id, channel: m.channel,
        t_post_kst: Number.isFinite(m.t) ? kst(m.t) : '', t_post_unix: Number.isFinite(m.t) ? m.t : '',
        market, symbol, name: p.name ?? '', entry_mode: p.entryMode ?? '', entry: p.entry ?? '', sl: p.sl ?? '',
        tp1: p.tps[0]?.price ?? '', tp2: p.tps[1]?.price ?? '', tp3: p.tps[2]?.price ?? '',
        horizon_days: p.horizonDays, stop_basis: p.stopBasis, stop_hours: p.stopHours ?? '',
        ok: p.ok && hit && Number.isFinite(m.t) && m.t && !['week', 'month', 'year', 'unknown'].includes(m.precision) ? 1 : 0,
        flags: flags.join(' / '), text: calls.length > 1 ? `[${i + 1}/${calls.length}] ${p.segment ?? ''}` : m.text,
      });
    });
  }
  const out = path.join(DATA, 'ledger.draft.csv');
  writeCsv(out, COLS, rows);
  const okN = rows.filter((r) => r.ok === 1).length;
  console.log(`콜 후보 ${rows.length}건 → ${out}`);
  console.log(`자동 확정 ${okN}건, 검토 필요 ${rows.length - okN}건. 검토 후 data/ledger.csv 로 저장하세요.`);
}

// 초안(자동 파싱)을 장부에 합친다: 기존 행은 그대로(사람이 고친 값 보존), 새 행만 추가.
// 시각이 부정확한(주/월/년) 새 행은 넣지 않는다 — 검증에 못 쓰고 목록만 길어진다.
function cmdMerge() {
  const draftFile = path.join(DATA, 'ledger.draft.csv');
  const ledgerFile = path.join(DATA, 'ledger.csv');
  if (!fs.existsSync(draftFile)) { console.log('초안이 없습니다. 먼저 parse 를 실행하세요.'); return; }
  const draft = readCsv(draftFile);
  const ledger = fs.existsSync(ledgerFile) ? readCsv(ledgerFile) : [];
  const known = new Set(ledger.map((r) => r.id));
  // 사람이 사진을 보고 적은 행과 같은 콜(같은 종목·같은 손절가·이틀 이내)은 중복으로 본다
  const day = (r) => Math.floor(Number(r.t_post_unix || 0) / DAY);
  const isDup = (r) => ledger.some((k) => (k.symbol || k.name) === (r.symbol || r.name) && k.sl === r.sl && Math.abs(day(k) - day(r)) <= 2);
  const added = [];
  for (const r of draft) {
    if (known.has(r.id) || isDup(r) || /부정확/.test(r.flags)) continue;
    ledger.push(r);
    added.push(r);
  }
  writeCsv(ledgerFile, COLS, ledger);
  const pending = ledger.filter((r) => r.ok !== '1' && !/부정확/.test(r.flags));
  fs.writeFileSync(
    path.join(DATA, 'pending_review.txt'),
    pending.map((r) => `${r.id} | ${r.t_post_kst} | ${r.name || '(종목?)'} | ${r.flags}`).join('\n'),
  );
  console.log(`장부 ${ledger.length}행 (신규 ${added.length}: 자동확정 ${added.filter((r) => r.ok === '1').length}, 검토필요 ${added.filter((r) => r.ok !== '1').length}) → ${ledgerFile}`);
}

function loadLedger() {
  const f = fs.existsSync(path.join(DATA, 'ledger.csv')) ? 'ledger.csv' : 'ledger.draft.csv';
  if (f !== 'ledger.csv') console.log('⚠ 검토본(data/ledger.csv)이 없어 초안을 사용합니다.');
  return readCsv(path.join(DATA, f)).map((r) => ({
    id: r.id,
    name: r.name ?? '',
    tPostKst: r.t_post_kst ?? '',
    channel: r.channel ?? '',
    tPost: Number(r.t_post_unix),
    market: r.market,
    symbol: r.symbol,
    ok: r.ok === '1',
    entryMode: r.entry_mode,
    entry: r.entry === '' ? null : Number(r.entry),
    sl: Number(r.sl),
    tps: [r.tp1, r.tp2, r.tp3].filter((x) => x !== '').map(Number).sort((a, b) => a - b),
    horizonDays: Number(r.horizon_days),
    stopBasis: r.stop_basis || 'TOUCH',
    stopHours: r.stop_hours === '' ? null : Number(r.stop_hours),
  })).map((c) => ({ ...c, tps: c.tps.map((p, _i, a) => ({ price: p, weight: 1 / a.length })) }));
}

const priceFile = (market, symbol) => path.join(PRICES, `${market}_${symbol}.json`);

async function cmdFetch() {
  fs.mkdirSync(PRICES, { recursive: true });
  const calls = loadLedger().filter((c) => c.ok);
  const groups = new Map();
  for (const c of calls) {
    const k = `${c.market}|${c.symbol}`;
    const span = (RULES.entryWindowDays + c.horizonDays + 3) * DAY;
    const g = groups.get(k) || { market: c.market, symbol: c.symbol, from: Infinity, to: -Infinity };
    g.from = Math.min(g.from, c.tPost - 3 * DAY);
    g.to = Math.max(g.to, c.tPost + span);
    groups.set(k, g);
  }
  const now = Date.now() / 1000;
  for (const g of groups.values()) {
    const to = Math.min(g.to, now);
    let bars;
    if (g.market === 'UPBIT') bars = await upbitHourly(g.symbol, g.from, to);
    else if (g.market === 'KRX') bars = await naverDaily(g.symbol, Math.ceil((now - g.from) / DAY) + 30);
    else { console.log(`건너뜀: 시장 미지정 ${g.symbol}`); continue; }
    fs.writeFileSync(priceFile(g.market, g.symbol), JSON.stringify(bars));
    console.log(`${g.market} ${g.symbol}: ${bars.length}봉`);
  }
}

const pct = (x) => (Number.isFinite(x) ? `${(x * 100).toFixed(1)}%` : '-');
const fx = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : x === Infinity ? '∞' : '-');

function renderStats(title, s) {
  const lines = [
    `### ${title}`,
    '',
    `| 항목 | 값 |`,
    `|---|---|`,
    `| 콜 수 / 체결 / 미체결 / 제외 / 데이터 없음 | ${s.calls} / ${s.filled} / ${s.unfilled} / ${s.skipped} / ${s.noData} |`,
    `| 승률 | ${pct(s.winRate)} |`,
    `| 기대값(평균 R) / 중앙값 R | ${fx(s.meanR)} / ${fx(s.medianR)} |`,
    `| t값 | ${fx(s.t)} |`,
    `| PF(R 기준) | ${fx(s.pf)} |`,
    `| 최대낙폭(건당 1% 리스크 복리) | ${pct(s.mdd)} |`,
    `| 최종 자산 배수 | ${fx(s.finalEquity, 3)} |`,
    `| 평균 보유일 / 최대 동시 보유 | ${fx(s.avgHoldDays, 1)} / ${s.maxConcurrent} |`,
    `| 청산 사유 | ${Object.entries(s.exitReasons).map(([k, v]) => `${k} ${v}`).join(', ') || '-'} |`,
    `| 데이터 부족으로 미완결 | ${s.incomplete} |`,
    `| t≥2 도달에 필요한 표본(현재 분산 기준) | ${s.requiredN ?? '-'} |`,
    '',
    `| 합격 기준 | 값 | 기준 | 결과 |`,
    `|---|---|---|---|`,
    ...Object.entries(s.checks).map(([k, c]) => `| ${k} | ${k === '최대낙폭' ? pct(c.value) : fx(c.value)} | ${c.need} | ${c.pass ? '✅' : '❌'} |`),
    '',
    `**판정: ${s.verdict}**`,
    '',
  ];
  return lines.join('\n');
}

function cmdSim() {
  const calls = loadLedger();
  const usable = calls.filter((c) => c.ok);
  const excluded = calls.length - usable.length;
  const runs = [
    ['A안 — 처음 제시된 목표가·손절가를 그대로 적용', {}],
    ['B안(비교) — 1차 목표 도달 후 손절가를 진입가로 이동', { breakevenAfterTp1: true }],
  ];
  const out = [
    '# 콜 검증 보고서',
    '',
    `생성: ${kst(Date.now() / 1000)} KST · 규칙과 합격 기준은 config.mjs(사전 확정) 기준`,
    '',
    `장부 ${calls.length}건 중 시뮬레이션 대상 ${usable.length}건 (검토 미확정·정보 부족 ${excluded}건 제외)`,
    '',
  ];
  const perCall = [];
  for (const [title, opts] of runs) {
    const res = [];
    for (const c of usable) {
      const f = priceFile(c.market, c.symbol);
      if (!fs.existsSync(f)) { res.push({ id: c.id, market: c.market, status: 'NO_DATA' }); continue; }
      const bars = JSON.parse(fs.readFileSync(f, 'utf8'));
      const barSec = c.market === 'UPBIT' ? HOUR : DAY;
      res.push(simulate(c, bars, barSec, RULES, COSTS[c.market], opts));
    }
    const s = stats(res, CRITERIA);
    out.push(renderStats(title, s));
    for (const m of ['UPBIT', 'KRX']) {
      const sub = res.filter((r) => r.market === m);
      if (sub.length) out.push(renderStats(`${title} · ${m === 'UPBIT' ? '코인(업비트)' : '국내주식'}`, stats(sub, CRITERIA)));
    }
    const chById = new Map(usable.map((c) => [c.id, c.channel]));
    for (const ch of [...new Set(usable.map((c) => c.channel))].filter(Boolean)) {
      const sub = res.filter((r) => chById.get(r.id) === ch);
      if (sub.length) out.push(renderStats(`${title} · 채널: ${ch}`, stats(sub, CRITERIA)));
    }
    console.log(`\n${title}\n  체결 ${s.filled}/${s.calls} · 승률 ${pct(s.winRate)} · 평균 ${fx(s.meanR)}R · t ${fx(s.t)} · PF ${fx(s.pf)} · MDD ${pct(s.mdd)} → ${s.verdict}`);
    if (!opts.breakevenAfterTp1) {
      for (const r of res) {
        perCall.push({
          id: r.id, market: r.market, status: r.status, mode: r.mode ?? '', fill: r.pf ?? '',
          R: Number.isFinite(r.R) ? r.R.toFixed(3) : '', net: Number.isFinite(r.net) ? r.net.toFixed(4) : '',
          reason: r.lastReason ?? r.reason ?? '', hold_days: Number.isFinite(r.holdDays) ? r.holdDays.toFixed(1) : '',
        });
      }
    }
  }
  fs.writeFileSync(path.join(DATA, 'report.md'), out.join('\n'));
  writeCsv(path.join(DATA, 'results.csv'), ['id', 'market', 'status', 'mode', 'fill', 'R', 'net', 'reason', 'hold_days'], perCall);
  fs.writeFileSync(path.join(DATA, 'summary.txt'), renderSummary(usable, perCall, excluded));
  console.log(`\n보고서: ${path.join(DATA, 'report.md')}`);
}

// 텔레그램으로 보낼 짧은 성적표 (A안 기준)
function renderSummary(usable, perCall, excluded) {
  const byId = new Map(usable.map((c) => [c.id, c]));
  const filled = perCall.filter((r) => r.status === 'FILLED');
  const s = stats(
    filled.map((r, i) => ({ status: 'FILLED', R: Number(r.R), tFill: i, tExit: i + 0.5, holdDays: Number(r.hold_days) || 0, lastReason: r.reason, incomplete: false })),
    CRITERIA,
  );
  const label = (r) => {
    if (r.status !== 'FILLED') return r.status === 'UNFILLED' ? '미체결' : r.status === 'SKIPPED' ? '제외' : '시세없음';
    if (r.reason === 'DATA_END') return `보유중 ${Number(r.R) >= 0 ? '+' : ''}${Number(r.R).toFixed(1)}R`;
    if (/^SL/.test(r.reason)) return `손절 ${Number(r.R).toFixed(1)}R`;
    if (/^TP/.test(r.reason)) return `목표 +${Number(r.R).toFixed(1)}R`;
    return `만료 ${Number(r.R) >= 0 ? '+' : ''}${Number(r.R).toFixed(1)}R`;
  };
  const lines = [
    `📊 콜 검증 주간 성적표 (${kst(Date.now() / 1000)} KST)`,
    `대상 ${usable.length}건 · 체결 ${filled.length} · 승률 ${pct(s.winRate)} · 평균 ${fx(s.meanR)}R · PF ${fx(s.pf)} · MDD ${pct(s.mdd)}`,
    `판정: ${s.verdict}${s.requiredN ? ` (t≥2까지 필요 표본 ${s.requiredN})` : ''}`,
    '',
    ...perCall.map((r) => `· ${(byId.get(r.id)?.tPostKst || '').slice(5, 10)} ${byId.get(r.id)?.name || r.id}: ${label(r)}`),
  ];
  let pending = '';
  try { pending = fs.readFileSync(path.join(DATA, 'pending_review.txt'), 'utf8').trim(); } catch { /* 없음 */ }
  if (pending) lines.push('', `⚠ 검토 필요 ${pending.split('\n').length}건 (목표가·종목 등 미확정):`, ...pending.split('\n').slice(0, 8).map((l) => '  ' + l.split(' | ').slice(1, 3).join(' ')));
  if (excluded) lines.push('', `(정보 부족으로 제외 ${excluded}건 · ⛔ 워크포워드 합격 전 실거래 금지)`);
  return lines.join('\n');
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'parse' && arg) await cmdParse(arg);
else if (cmd === 'merge') cmdMerge();
else if (cmd === 'fetch') await cmdFetch();
else if (cmd === 'sim') cmdSim();
else console.log('사용법: node run.mjs parse <파일> | merge | fetch | sim');

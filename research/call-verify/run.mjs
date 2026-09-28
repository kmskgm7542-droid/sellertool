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
import { parseCall, simulate, stats, DAY, HOUR } from './lib.mjs';
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
        id: `tg${m.id}`,
        channel: m.channel ?? j.name ?? '',
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
  const msgs = loadMessages(file).filter((m) => /(매수|현재가)/.test(m.text) && /(손절|컷)/.test(m.text));
  let byName = new Map();
  try {
    const mk = await upbitMarkets();
    byName = new Map(mk.filter((x) => x.market.startsWith('KRW-')).map((x) => [x.korean_name, x.market]));
  } catch {
    console.log('⚠ 업비트 종목 목록을 받지 못했습니다. 코인/주식 구분은 검토 단계에서 채워 주세요.');
  }
  const rows = msgs.map((m) => {
    const p = parseCall(m.text, RULES);
    const flags = [...p.flags];
    let market = '';
    let symbol = '';
    if (p.name && byName.has(p.name)) { market = 'UPBIT'; symbol = byName.get(p.name); }
    else if (p.name && /^\d{6}$/.test(p.name)) { market = 'KRX'; symbol = p.name; }
    else flags.push('시장·종목코드 입력 필요');
    if (!Number.isFinite(m.t)) flags.push('게시 시각 없음');
    return {
      id: m.id, channel: m.channel, t_post_kst: Number.isFinite(m.t) ? kst(m.t) : '', t_post_unix: Number.isFinite(m.t) ? m.t : '',
      market, symbol, name: p.name ?? '', entry_mode: p.entryMode ?? '', entry: p.entry ?? '', sl: p.sl ?? '',
      tp1: p.tps[0]?.price ?? '', tp2: p.tps[1]?.price ?? '', tp3: p.tps[2]?.price ?? '',
      horizon_days: p.horizonDays, stop_basis: p.stopBasis, stop_hours: p.stopHours ?? '',
      ok: p.ok && market && Number.isFinite(m.t) ? 1 : 0, flags: flags.join(' / '), text: m.text,
    };
  });
  const out = path.join(DATA, 'ledger.draft.csv');
  writeCsv(out, COLS, rows);
  const okN = rows.filter((r) => r.ok === 1).length;
  console.log(`콜 후보 ${rows.length}건 → ${out}`);
  console.log(`자동 확정 ${okN}건, 검토 필요 ${rows.length - okN}건. 검토 후 data/ledger.csv 로 저장하세요.`);
}

function loadLedger() {
  const f = fs.existsSync(path.join(DATA, 'ledger.csv')) ? 'ledger.csv' : 'ledger.draft.csv';
  if (f !== 'ledger.csv') console.log('⚠ 검토본(data/ledger.csv)이 없어 초안을 사용합니다.');
  return readCsv(path.join(DATA, f)).map((r) => ({
    id: r.id,
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
  console.log(`\n보고서: ${path.join(DATA, 'report.md')}`);
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'parse' && arg) await cmdParse(arg);
else if (cmd === 'fetch') await cmdFetch();
else if (cmd === 'sim') cmdSim();
else console.log('사용법: node run.mjs parse <파일> | fetch | sim');

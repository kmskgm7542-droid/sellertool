// 관심종목 장부 — 방송·게시판에서 강조된 종목을 콜 검증(원장)과 따로 관리하고, 말한 가격에 오면 알림을 보낸다.
//   파일: data/watchlist.json (PC 에만. 콜 원문·가격이라 레포에 올리지 않는다)
//   등급: 장투(장투·중장기·묻어둬라) / 대기(매수가 있음, 아직 안 옴) / 관심(가격 없이 차트 좋다·관심종목)
//   봇 명령(live.mjs 가 받아 처리):
//     관심 삼성전자 대기 매수 15만~16만 손절 14.5만 목표 33만 50만
//     관심 한화비전 장투 기준 28000          (기준 = 이 가격 아래로 내려가면 경보)
//     관심 현대차 돌파 31만                   (돌파 = 이 가격 위로 올라가면 알림)
//     관심 / 관심 후보 / 관심 삭제 종목 / 관심 승인 3 [매수 …] / 관심 승인 전부 / 관심 버림 3 / 관심 버림 전부
//   이 파일은 해석·저장만 한다. 가격 확인·알림은 watch.mjs, 방송·게시판 강조 후보 찾기는 watch_scan.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizePrices } from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DATA = path.join(HERE, 'data');
export const WATCH_FILE = path.join(DATA, 'watchlist.json');

export const TIERS = ['장투', '대기', '관심'];
const TIER_WORD = { 장투: '장투', 중장기: '장투', 장기: '장투', 대기: '대기', 관심: '관심' };
const KEYS = { 매수: 'buy', 손절: 'stop', 기준: 'line', 기준선: 'line', 이탈: 'line', 목표: 'targets', 돌파: 'breakout' };

const readJson = (f, d) => {
  try { return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d; } catch { return d; }
};

export function loadWatch(file = WATCH_FILE) {
  const w = readJson(file, null) || {};
  return { items: w.items || [], candidates: w.candidates || [], seq: w.seq || 0 };
}
export function saveWatch(w, file = WATCH_FILE) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(w, null, 1));
}

// "15만", "33.3만", "1,117,000", "15만5천", "0.95", "28000원" → 숫자. 못 읽으면 null.
export function parsePrice(tok) {
  const s = normalizePrices(String(tok)).replace(/원$/, '').trim();
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(억|만|천)?$/);
  if (!m) return null;
  const v = Number(m[1]) * (m[2] === '억' ? 1e8 : m[2] === '만' ? 1e4 : m[2] === '천' ? 1e3 : 1);
  return Number.isFinite(v) && v > 0 ? Math.round(v * 1e8) / 1e8 : null;
}

// "매수 15만~16만 손절 14.5만 목표 33만 50만" → { buy:[150000,160000], stop:[145000], targets:[330000,500000] }
export function parseLevels(text) {
  const out = {};
  const s = normalizePrices(String(text)).replace(/[～]/g, '~').replace(/(\d)\s*~\s*(\d)/g, '$1~$2');
  const toks = s.split(/\s+/).filter(Boolean);
  let key = null;
  for (const t of toks) {
    const k = KEYS[t.replace(/[:：]$/, '')];
    if (k) { key = k; continue; }
    if (!key) continue;
    const parts = t.split('~').map(parsePrice);
    if (parts.some((x) => x == null)) continue;
    (out[key] ||= []).push(...parts);
  }
  const norm = {};
  if (out.buy?.length) norm.buy = [Math.min(...out.buy), Math.max(...out.buy)];
  if (out.stop?.length) norm.stop = [...new Set(out.stop)].sort((a, b) => b - a);
  if (out.line?.length) norm.line = Math.max(...out.line);
  if (out.targets?.length) norm.targets = [...new Set(out.targets)].sort((a, b) => a - b);
  if (out.breakout?.length) norm.breakout = Math.max(...out.breakout);
  return norm;
}

// 봇 한 줄 해석. "관심"으로 시작하지 않으면 null.
export function parseWatchCommand(text) {
  const t = String(text).trim();
  if (!/^관심(?:\s|$)/.test(t)) return null;
  const rest = t.replace(/^관심\s*/, '').trim();
  if (!rest) return { kind: 'watch-list' };
  if (/^후보$/.test(rest)) return { kind: 'watch-cands' };
  if (/^(?:도움말|help)$/i.test(rest)) return { kind: 'watch-help' };
  let m = rest.match(/^(?:삭제|제거|종료)\s+(\S+)$/);
  if (m) return { kind: 'watch-del', name: m[1].replace(/^#/, '') };
  m = rest.match(/^승인\s+(전부|모두|\d+(?:\s*,\s*\d+)*)\s*(.*)$/);
  if (m) return { kind: 'watch-approve', ids: /전부|모두/.test(m[1]) ? 'all' : m[1].split(/\s*,\s*/).map(Number), levels: parseLevels(m[2]), tier: tierOf(m[2]) };
  m = rest.match(/^(?:버림|버리기|무시)\s+(전부|모두|\d+(?:\s*,\s*\d+)*)$/);
  if (m) return { kind: 'watch-drop', ids: /전부|모두/.test(m[1]) ? 'all' : m[1].split(/\s*,\s*/).map(Number) };
  const words = rest.split(/\s+/);
  const name = words[0].replace(/^#/, '');
  const body = words.slice(1).join(' ');
  return { kind: 'watch-add', name, tier: tierOf(body), levels: parseLevels(body) };
}
function tierOf(s) {
  for (const w of String(s).split(/\s+/)) if (TIER_WORD[w]) return TIER_WORD[w];
  return null;
}

// 등록·갱신(같은 이름이면 준 값만 덮어쓴다). hit = [시장, 코드] 또는 null
export function upsertItem(w, { name, tier, levels = {}, hit = null, source = '봇', note = '' }) {
  let it = w.items.find((x) => x.name === name && x.status !== 'closed');
  const now = new Date().toISOString();
  if (!it) {
    it = { name, tier: null, market: null, symbol: null, status: 'active', source, added_at: now, mentions: 0 };
    w.items.push(it);
  }
  if (hit) { it.market = hit[0]; it.symbol = hit[1]; }
  Object.assign(it, levels);
  it.tier = tier || it.tier || (it.buy ? '대기' : '관심');
  if (note) it.note = note;
  it.updated_at = now;
  return it;
}

export function removeItem(w, name) {
  const it = w.items.find((x) => x.name === name && x.status !== 'closed');
  if (!it) return null;
  it.status = 'closed';
  it.closed_at = new Date().toISOString();
  return it;
}

export const fmt = (x) => (x == null ? '-' : Number(x).toLocaleString('ko-KR', { maximumFractionDigits: 8 }));

export function describe(it) {
  const p = [];
  if (it.buy) p.push(`매수 ${it.buy[0] === it.buy[1] ? fmt(it.buy[0]) : `${fmt(it.buy[0])}~${fmt(it.buy[1])}`}`);
  if (it.stop) p.push(`손절 ${it.stop.map(fmt).join('/')}`);
  if (it.line) p.push(`기준 ${fmt(it.line)}`);
  if (it.targets) p.push(`목표 ${it.targets.map(fmt).join('/')}`);
  if (it.breakout) p.push(`돌파 ${fmt(it.breakout)}`);
  return `${it.name} [${it.tier}]${p.length ? ' ' + p.join(' · ') : ''}${it.symbol ? '' : ' ⚠코드 미확인'}`;
}

// 현재가로 판정 — 켜진 조건 목록. key 는 알림 중복 방지용.
export const NEAR = 0.03;
export function evaluate(it, price) {
  const out = [];
  if (!(price > 0)) return out;
  const stops = it.stop || [];
  for (const s of stops) if (price <= s) out.push({ key: `stop:${s}`, icon: '🔴', text: `손절가 ${fmt(s)} 이탈` });
  const brokeStop = stops.some((s) => price <= s);
  if (it.buy && !brokeStop) {
    const [lo, hi] = it.buy;
    if (price <= hi) out.push({ key: 'buy', icon: '🟢', text: `매수 구간 도달(${lo === hi ? fmt(hi) : `${fmt(lo)}~${fmt(hi)}`}${price < lo ? ', 구간 아래' : ''})` });
    else if (price <= hi * (1 + NEAR)) out.push({ key: 'near-buy', icon: '🟡', text: `매수 구간 ${fmt(hi)} 3% 이내 접근` });
  }
  if (it.line) {
    if (price < it.line) out.push({ key: 'line', icon: '🔴', text: `기준선 ${fmt(it.line)} 이탈` });
    else if (price <= it.line * (1 + NEAR)) out.push({ key: 'near-line', icon: '🟡', text: `기준선 ${fmt(it.line)} 3% 이내 접근` });
  }
  for (const t of it.targets || []) if (price >= t) out.push({ key: `tp:${t}`, icon: '🎯', text: `목표가 ${fmt(t)} 도달` });
  if (it.breakout) {
    if (price >= it.breakout) out.push({ key: 'brk', icon: '🚀', text: `돌파 기준 ${fmt(it.breakout)} 위` });
    else if (price >= it.breakout * (1 - NEAR)) out.push({ key: 'near-brk', icon: '🟡', text: `돌파 기준 ${fmt(it.breakout)} 3% 이내 접근` });
  }
  return out;
}

// 알림 상태 갱신: 조건이 새로 켜졌고 오늘 아직 안 보낸 것만 돌려준다(같은 알림은 하루 한 번, 꺼졌다 다시 켜질 때만).
export function newAlerts(state, itemKey, conds, today) {
  state.on ||= {};
  state.sent ||= {};
  const fresh = [];
  const prefix = `${itemKey}|`;
  const nowOn = new Set(conds.map((c) => prefix + c.key));
  for (const k of Object.keys(state.on)) if (k.startsWith(prefix) && !nowOn.has(k)) delete state.on[k];
  for (const c of conds) {
    const k = prefix + c.key;
    if (state.on[k]) continue;
    state.on[k] = true;
    if (state.sent[k] === today) continue;
    state.sent[k] = today;
    fresh.push(c);
  }
  return fresh;
}

export const HELP = [
  '관심종목 명령',
  '· 등록: 관심 종목 [장투|대기|관심] [매수 a~b] [손절 x] [기준 x] [목표 t1 t2] [돌파 x]',
  '  예) 관심 삼성전자 대기 매수 15만~16만 목표 33만',
  '  예) 관심 한화비전 장투 기준 28000',
  '· 목록: 관심   · 삭제: 관심 삭제 종목',
  '· 방송·게시판 강조 후보: 관심 후보 → 관심 승인 3 [매수 …] / 관심 승인 전부 / 관심 버림 3',
].join('\n');

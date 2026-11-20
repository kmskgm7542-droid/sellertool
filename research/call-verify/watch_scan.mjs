// 방송 자막·게시판에서 '강조된 종목'을 찾아 관심종목 후보로 올린다(daily_run 21:30, 자동추출 다음).
//   강조 = 장투·중장기·묻어둬라·관심종목·차트 좋다·모아가라·1년·6개월·인생 자리 …
//   후보는 바로 등록하지 않고 텔레그램으로 알려 대표가 "관심 승인 번호"로 확정한다(이미 관심종목이면 '재강조' 횟수만 올린다).
//   종목명을 못 찾은 강조(자막 오인 등)는 data/watch_review.txt 에 남긴다 → 맞는 이름이면 "별칭 들리는이름=공식이름".
//   실행: node watch_scan.mjs [--dry]
//   처음 실행: 사흘보다 오래된 방송·게시글은 '본 것'으로만 표시(지난 자료가 한꺼번에 후보로 쏟아지지 않게).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULES } from './config.mjs';
import { parseCall } from './lib.mjs';
import { AMBIGUOUS, MARKET_TALK, buildNameRegex, normalizeSpeech } from './extract_rules.mjs';
import { loadUserAliases } from './aliases.mjs';
import { makeLookup, notifyText } from './live.mjs';
import { DATA, describe, loadWatch, saveWatch } from './watchlist.mjs';

const VOD = path.join(DATA, 'live_vod');
const POSTS = path.join(DATA, 'yt_result.json');
const STATE = path.join(DATA, 'watch_scan_state.json');
const REVIEW = path.join(DATA, 'watch_review.txt');
const readJson = (f, d) => { try { return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d; } catch { return d; } };

export const EMPH = /장투|장토|중장기|장기\s*(?:로|적|투자|보유|관점)|묻어\s*(?:두|놓|가)|덮어\s*(?:두|놓)|관심\s*종목|관심\s*있게|장바구니|차트\s*(?:가|는|도)?\s*(?:정말|너무|진짜|아주|겁나)?\s*(?:좋|이쁘|예쁘)|모아\s*(?:가|볼)|눈여겨|예의\s*주시|1년|6개월|적금|인생\s*(?:자리|매수)|비중\s*(?:있게|실어)/;
export const LONG = /장투|장토|중장기|장기|묻어|덮어|1년|6개월|적금|인생/;
// 일상어와 겹치는 코인 이름(자동추출의 AMBIGUOUS 에 더해) — "그 사인 나오기를"
const SCAN_AMBIGUOUS = new Set(['사인']);
// '코인'이라는 말이 같이 나와야 코인 이름으로 본다. "비트코인"의 코인은 제외
const coinTalk = (s) => /(?<!비트)코인/.test(s);
const okName = (raw, ctx) => !((AMBIGUOUS.has(raw) || SCAN_AMBIGUOUS.has(raw)) && !coinTalk(ctx));
const md = (sec) => new Date((sec + 9 * 3600) * 1000).toISOString().slice(5, 10);

// 콜 파서로 가격을 읽을 수 있으면(진입+손절) 후보에 미리 채운다 — 승인 때 바꿀 수 있다
export function levelsFrom(text) {
  const p = parseCall(text, RULES);
  if (!(p.entry > 0) || !(p.sl > 0)) return {};
  const lv = { buy: p.entryRange ? [Math.min(...p.entryRange), Math.max(...p.entryRange)] : [p.entry, p.entry], stop: [p.sl] };
  if (p.tps?.length) lv.targets = p.tps.map((t) => t.price);
  return lv;
}

// 자막 구간 → [{name, raw, t, tier, excerpt, levels}] (같은 종목은 방송당 한 번, 횟수만 센다)
export function findEmphasis(segs, nameRe, canonical = (x) => x) {
  const found = new Map();
  const unnamed = [];
  let lastUnnamed = -999;
  for (let i = 0; i < segs.length; i++) {
    if (!EMPH.test(segs[i].text)) continue;
    const near = segs.slice(Math.max(0, i - 2), i + 2).map((s) => s.text).join(' ');
    const names = [...new Set(near.match(nameRe) || [])].filter((raw) => okName(raw, near));
    const excerpt = segs.slice(Math.max(0, i - 1), i + 2).map((s) => s.text).join(' ').slice(0, 140);
    if (!names.length) {
      if (LONG.test(segs[i].text) && segs[i].t - lastUnnamed > 120) { unnamed.push({ t: segs[i].t, excerpt }); lastUnnamed = segs[i].t; }
      continue;
    }
    for (const raw of names.slice(0, 2)) {
      const name = canonical(raw);
      const f = found.get(name);
      if (f) { f.count++; if (LONG.test(near)) f.tier = '장투'; continue; }
      const win = segs.slice(Math.max(0, i - 2), i + 7).map((s) => s.text).join(' ');
      found.set(name, { name, t: segs[i].t, count: 1, tier: LONG.test(near) ? '장투' : '관심', excerpt, levels: levelsFrom(normalizeSpeech(win)) });
    }
  }
  return { found: [...found.values()], unnamed };
}

// 후보 합치기: 이미 관심종목이면 재강조 횟수만, 대기 후보면 횟수·날짜 갱신, 새 것이면 번호를 붙여 추가
export function mergeCandidate(w, c, lookup) {
  const it = w.items.find((x) => x.name === c.name && x.status !== 'closed');
  if (it) {
    it.mentions = (it.mentions || 0) + c.count;
    it.last_emphasis = c.date;
    if (c.tier === '장투' && it.tier === '관심') it.tier = '장투';
    return { type: 'again', item: it };
  }
  if (MARKET_TALK.has(c.name)) return null; // 시장 지표 종목(비트·이더·삼성·하이닉스)은 매번 언급돼 후보로 올리지 않는다 — 직접 등록
  const prev = w.candidates.find((x) => x.name === c.name);
  if (prev) {
    prev.count += c.count;
    prev.date = c.date;
    if (c.tier === '장투') prev.tier = '장투';
    if (!prev.buy && !prev.stop && c.levels?.buy) Object.assign(prev, c.levels); // 가격은 처음 읽힌 것 유지
    return { type: 'more', cand: prev };
  }
  const hit = lookup(c.name);
  const cand = { id: ++w.seq, name: c.name, tier: c.tier, market: hit?.[0] ?? null, symbol: hit?.[1] ?? null, src: c.src, date: c.date, count: c.count, excerpt: c.excerpt, ...c.levels };
  w.candidates.push(cand);
  if (w.candidates.length > 60) w.candidates = w.candidates.slice(-60);
  return { type: 'new', cand };
}

async function main() {
  const dry = process.argv.includes('--dry');
  const lookup = makeLookup();
  const nameRe = buildNameRegex(readJson(path.join(DATA, 'krx_list.json'), {}), readJson(path.join(DATA, 'upbit_markets.json'), {}), loadUserAliases());
  const state = readJson(STATE, null) || { videos: {}, posts: {}, since: Date.now() / 1000 - 3 * 86400 };
  const w = loadWatch();
  const news = [];
  const again = new Map();
  const review = [];
  const add = (c) => {
    const r = mergeCandidate(w, c, lookup);
    if (!r) return;
    if (r.type === 'again') again.set(r.item.name, r.item);
    else if (!news.includes(r.cand)) news.push(r.cand);
  };

  // 1) 방송 자막
  const files = fs.existsSync(VOD) ? fs.readdirSync(VOD).filter((f) => f.endsWith('.json')) : [];
  for (const f of files) {
    const id = f.slice(0, -5);
    if (state.videos[id]) continue;
    const v = readJson(path.join(VOD, f), {});
    const start = Number(v.startUnix) || 0;
    state.videos[id] = start || 1;
    if (start && start < state.since) continue; // 처음 실행 때 지난 방송은 본 것으로만
    const { found, unnamed } = findEmphasis(v.segments || [], nameRe, lookup.canonical);
    for (const c of found) add({ ...c, src: '방송', date: start ? md(start + c.t) : '' });
    for (const u of unnamed) review.push(`${start ? md(start + u.t) : '?'} | 이름 미확인 강조 | ${(v.title || id).slice(0, 30)} | ${u.excerpt}`);
  }

  // 2) 게시판
  const posts = readJson(POSTS, { messages: [] }).messages || [];
  for (const p of posts) {
    const key = p.post_id || p.id;
    if (!key || state.posts[key]) continue;
    state.posts[key] = 1;
    const sec = Number(p.date_unixtime) || 0;
    if (!sec || sec < state.since) continue;
    const text = String(p.text || '');
    if (/요약/.test(text.slice(0, 40))) continue; // 방송 요약 글은 여러 종목을 훑어 후보가 부정확하다
    const names = [...new Set(text.match(nameRe) || [])].filter((raw) => okName(raw, text));
    if (!names.length) continue;
    const priced = /매수/.test(text) && /\d/.test(text);
    if (!EMPH.test(text) && !priced) continue;
    names.slice(0, 3).forEach((raw) => add({
      name: lookup.canonical(raw), count: 1, tier: LONG.test(text) ? '장투' : priced ? '대기' : '관심', src: '게시판', date: md(sec),
      excerpt: text.replace(/\s+/g, ' ').slice(0, 140), levels: names.length === 1 ? levelsFrom(text) : {}, // 여러 종목 글은 가격이 누구 것인지 몰라 비워 둔다
    }));
  }

  console.log(`강조 후보 새로 ${news.length}건 · 관심종목 재강조 ${again.size}건 · 이름 미확인 ${review.length}건`);
  if (dry) {
    for (const c of news) console.log(`#${c.id} ${describe(c)} · ${c.src} ${c.date} ×${c.count} | ${c.excerpt}`);
    return;
  }
  saveWatch(w);
  fs.writeFileSync(STATE, JSON.stringify(state));
  if (review.length) {
    const prev = fs.existsSync(REVIEW) ? fs.readFileSync(REVIEW, 'utf8').split('\n').filter(Boolean) : [];
    fs.writeFileSync(REVIEW, [...prev, ...review].slice(-200).join('\n') + '\n');
  }
  if (!news.length && !again.size) return;
  const lines = [];
  if (news.length) lines.push(`⭐ 강조 후보 ${news.length}건 — 등록: 관심 승인 번호 [매수 …] / 관심 승인 전부, 버림: 관심 버림 번호`, ...news.slice(0, 15).map((c) => `#${c.id} ${describe(c)}${c.buy ? ' (가격 자동 추정 — 확인)' : ''} · ${c.src} ${c.date}${c.count > 1 ? ` ×${c.count}` : ''}\n   "${c.excerpt.slice(0, 70)}…"`));
  if (again.size) lines.push(`🔁 관심종목 재강조: ${[...again.values()].map((x) => `${x.name}(누적 ${x.mentions})`).join(', ')}`);
  if (review.length) lines.push(`🔎 종목명을 못 찾은 강조 ${review.length}건 → 김이사 확인`);
  console.log((await notifyText(lines.join('\n'))) ? '텔레그램 전송' : '(봇 미설정 — 전송 생략)');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.log(`✖ ${e.message}`); process.exit(1); });
}

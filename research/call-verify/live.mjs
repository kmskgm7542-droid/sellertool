// 방송 타점 직접 기록 — 대표가 방송을 보며 텔레그램 봇에 한 줄로 보내면, 즉시 해석해 답장하고 data/live_calls.json 에 쌓는다.
//   형식: 종목  [진입가|현재가]  매수  손절 N  목표 N [N]  [기간]  [손절기준]
//   예:   삼성전자 7만 매수 손절 6.8만 목표 7.5만 8만 2주
//         에코프로 현재가 매수 손절 12만 목표 15만 일봉종가
//         비트코인 9500만 아래 매수 손절 9000만 목표 1억 1주 1시간종가
//   취소: "취소" 또는 "취소 <종목>" → 직전(또는 그 종목의 마지막) 기록을 무효 처리
//   실행: node live.mjs --once            (밀린 메시지만 처리하고 종료 — 매일/매주 배치에서)
//         node live.mjs --minutes 130     (방송 시간대에 계속 대기하며 즉시 답장 — 작업 스케줄러)
//   시각은 텔레그램 서버 시각(정확). 검증 규칙은 config.mjs 그대로, 여기서는 해석·기록만 한다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULES } from './config.mjs';
import { parseCall } from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(HERE, 'data');
const CHANNEL = '방송(직접 기록)';
const FILE = path.join(DATA, 'live_calls.json');
const STATE = path.join(DATA, 'live_state.json');

const readJson = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
const kst = (sec) => new Date((sec + 9 * 3600) * 1000).toISOString().replace('T', ' ').slice(0, 16);

// ── 종목 찾기(markets.bat 이 받아둔 목록) ──
function makeLookup() {
  const upbit = readJson(path.join(DATA, 'upbit_markets.json'), {});
  const krx = readJson(path.join(DATA, 'krx_list.json'), {});
  return (name) => {
    if (!name) return null;
    if (/^\d{6}$/.test(name)) return ['KRX', name];
    if (upbit[name]) return ['UPBIT', upbit[name]];
    if (krx[name]) return ['KRX', krx[name]];
    // 직접 입력한 이름은 줄임말("엑시" → 엑시인피니티)만 허용. 반대 방향("테스트종목" → 테스)은 오인이라 쓰지 않는다.
    const up = Object.keys(upbit).filter((k) => k.startsWith(name));
    if (up.length === 1) return ['UPBIT', upbit[up[0]]];
    const kr = Object.keys(krx).filter((k) => k.startsWith(name));
    if (kr.length === 1) return ['KRX', krx[kr[0]]];
    return null;
  };
}

// ── 한 줄 해석: 첫 단어 = 종목명(확정), 나머지는 콜 파서 ──
export function interpret(text, lookup = () => null) {
  const t = String(text).trim();
  const cancel = t.match(/^취소(?:\s+(\S+))?$/);
  if (cancel) return { kind: 'cancel', name: cancel[1] ?? null };
  const words = t.split(/\s+/);
  if (words.length < 2) return { kind: 'ignore' };
  const name = words[0].replace(/^#/, '');
  const rest = words.slice(1).join(' ');
  if (!/(매수|진입)/.test(rest) || !/(손절|컷|스탑)/.test(rest)) return { kind: 'ignore' };
  const p = parseCall(rest, RULES);
  p.name = name;
  p.flags = p.flags.filter((f) => f !== '종목명 없음');
  const hit = lookup(name);
  const fmt = (x) => (x == null ? '-' : x.toLocaleString('ko-KR'));
  const lines = [];
  if (p.ok) {
    lines.push(`✅ 기록: ${name}${hit ? ` (${hit[0] === 'UPBIT' ? '업비트 ' : '국내주식 '}${hit[1]})` : ' (종목코드 미확인 → 검토 필요)'}`);
    lines.push(`진입 ${p.entryMode === 'MARKET' ? '현재가' : fmt(p.entry)} · 손절 ${fmt(p.sl)} (${p.stopBasis === 'CLOSE' ? `${p.stopHours === 24 ? '일봉' : p.stopHours + '시간'} 종가` : '터치'}) · 목표 ${p.tps.map((x) => fmt(x.price)).join('/')} · ${p.horizonDays}일`);
    const warn = p.flags.filter((f) => !/기본값|터치 적용/.test(f));
    if (warn.length) lines.push(`⚠ ${warn.join(' / ')}`);
    lines.push('틀렸으면 "취소" 후 다시 보내세요.');
  } else {
    lines.push(`❌ 검증 제외로 기록: ${name} — ${p.flags.filter((f) => /없음|이상|미지원/.test(f)).join(' / ') || '형식 확인'}`);
    lines.push('형식: 종목 [진입가|현재가] 매수 손절 N 목표 N [N] [기간]');
  }
  return { kind: 'call', name, parsed: p, hit, reply: lines.join('\n') };
}

// ── 기록 파일(run.mjs parse 가 읽는 텔레그램 내보내기 형식) ──
function appendCall(msg, res) {
  const j = readJson(FILE, { name: CHANNEL, messages: [] });
  j.messages.push({
    id: `live${msg.message_id}`, type: 'message', channel: CHANNEL, date_precision: 'exact',
    date: new Date(msg.date * 1000).toISOString(), date_unixtime: String(msg.date),
    name: res.name, text: msg.text, ok_hint: res.parsed.ok ? 1 : 0,
  });
  fs.writeFileSync(FILE, JSON.stringify(j, null, 1));
}
function cancelCall(name) {
  const j = readJson(FILE, { name: CHANNEL, messages: [] });
  for (let i = j.messages.length - 1; i >= 0; i--) {
    const m = j.messages[i];
    if (m.type !== 'message') continue;
    if (name && m.name !== name) continue;
    j.messages[i] = { ...m, type: 'cancelled', cancelled_at: new Date().toISOString() };
    fs.writeFileSync(FILE, JSON.stringify(j, null, 1));
    return m;
  }
  return null;
}

// ── 텔레그램 봇 API ──
function botCfg() {
  const c = readJson(path.join(DATA, 'tg_bot.json'), null);
  if (!c?.token) { console.log('data/tg_bot.json 이 없습니다. setup_bot.bat 을 먼저 실행하세요.'); process.exit(1); }
  return c;
}
async function api(c, method, params) {
  const r = await fetch(`https://api.telegram.org/bot${c.token}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params ?? {}),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(`${method}: ${j.description}`);
  return j.result;
}

export async function handleUpdate(u, ctx) {
  const msg = u.message;
  if (!msg?.text || String(msg.chat?.id) !== String(ctx.chatId)) return;
  const res = interpret(msg.text, ctx.lookup);
  if (res.kind === 'ignore') return;
  if (res.kind === 'cancel') {
    const m = cancelCall(res.name);
    await ctx.reply(m ? `↩ 취소: ${kst(Number(m.date_unixtime))} ${m.name}` : '취소할 기록이 없습니다.');
    return;
  }
  appendCall(msg, res);
  console.log(`[${kst(msg.date)}] ${res.name}: ${res.parsed.ok ? 'OK' : '제외'}`);
  await ctx.reply(res.reply);
}

async function main() {
  const args = process.argv.slice(2);
  const minutes = Number(args[args.indexOf('--minutes') + 1]) || 0;
  const c = botCfg();
  const lookup = makeLookup();
  const ctx = { chatId: c.chat_id, lookup, reply: (text) => api(c, 'sendMessage', { chat_id: c.chat_id, text }) };
  const state = readJson(STATE, { offset: 0 });
  const until = Date.now() + minutes * 60000;
  fs.mkdirSync(DATA, { recursive: true });
  console.log(`live.mjs ${minutes ? `${minutes}분 대기` : '밀린 메시지 처리'} 시작 (offset ${state.offset})`);
  do {
    let updates;
    try {
      updates = await api(c, 'getUpdates', { offset: state.offset, timeout: minutes ? 50 : 0, allowed_updates: ['message'] });
    } catch (e) {
      console.log(`getUpdates 실패: ${e.message}`);
      if (!minutes) break;
      await new Promise((r) => setTimeout(r, 15000));
      continue;
    }
    for (const u of updates) {
      try { await handleUpdate(u, ctx); } catch (e) { console.log(`처리 실패(update ${u.update_id}): ${e.message}`); }
      state.offset = u.update_id + 1;
      fs.writeFileSync(STATE, JSON.stringify(state));
    }
    if (!minutes && !updates.length) break;
  } while (Date.now() < until);
  console.log('live.mjs 끝');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.log(`✖ ${e.message}`); process.exit(1); });
}

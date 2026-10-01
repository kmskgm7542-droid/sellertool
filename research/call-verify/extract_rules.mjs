// 방송 자막에서 매수 타점을 규칙(파서 + 종목 사전)으로 뽑는다 — 무료 경로. API 키가 있으면 extract_calls.py(Claude)가 대신 돈다.
//   node extract_rules.mjs          data/live_vod/*.json 중 미처리분 → data/live_calls.json + 텔레그램 요약
//   node extract_rules.mjs --dry    기록·전송 없이 화면에만
//   방식: 자막에서 종목 사전(코스피·코스닥 3자 이상, 업비트 전체)에 있는 이름이 나온 지점마다 앞뒤 약 1~2분을 창으로 잡고,
//         말투("사도 돼요", "깨지면 나가")를 콜 표기("매수", "손절")로 바꾼 뒤 게시판 콜 파서로 해석한다.
//         진입 표현 + (손절 또는 목표 숫자)가 있어야 후보. 시각 = 방송 시작 + 자막 오프셋.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULES } from './config.mjs';
import { parseCall } from './lib.mjs';
import { notifyText } from './live.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(HERE, 'data');
const VOD = path.join(DATA, 'live_vod');
const FILE = path.join(DATA, 'live_calls.json');
const STATE = path.join(DATA, 'extract_state.json');
const CHANNEL = '방송(자동추출)';
const BEFORE = 2; // 창: 이름이 나온 자막 앞 2구간
const AFTER = 8; //     뒤 8구간(약 1~2분)
const RULES_VERSION = 2; // 추출 규칙이 바뀌면 올린다 → 기존 자동추출 기록을 지우고 전체를 다시 뽑는다

// 일상어와 같은 코인 이름 — "구간인지를 보라는 거지", "리스크를 줄이는" 처럼 말에 섞여 오탐이 잦다.
// 같은 창 안에 '코인'이라는 말이 함께 나올 때만 종목으로 본다.
const AMBIGUOUS = new Set(['보라', '리스크', '온도', '스토리', '무브', '오더', '메탈', '체인', '미나', '아크', '플로우', '알파', '샌드', '비전', '스택스', '세이', '수이', '월드', '니어', '갤러리', '퀀텀', '스팀', '마스크', '펀디', '썸씽', '밀크', '보스', '엘프', '온톨로지']);
// 명시적 매수 표현 — 이름이 나온 자막과 바로 앞뒤 자막(약 ±15초) 안에 있어야 타점으로 본다
const BUY_CUE = /(?:현재가|지금|여기서?|시장가|이\s*자리)\s*(?:에서\s*)?(?:매수|잡|사도|사세|사시|사면|들어가|진입)|매수\s*(?:가능|괜찮|해\s*볼|자리|포인트|구간|존|타이밍|같|가\s*봤|해도|관점)|잡아\s*(?:볼\s*만|도\s*(?:된|돼)|보세요)|들어가\s*(?:볼|도\s*(?:된|돼))|공략\s*(?:해\s*볼|가능|해도)|사도\s*(?:돼|되|됩)|사셔도|담아도|담아\s*볼/;
// 복기·보유 관리 표현 — 같은 짧은 창에 있으면 새 매수 콜이 아니다(이미 산 것, 익절한 것, 예전에 잡아 드린 것)
const PAST_CUE = /익절|입절|먹었|먹고\s*나|수익\s*났|도달|드렸|드린|잡았|잡아서|들어갔|팔았|탈출|털었|홀딩|보유|가지고\s*있|매도\s*시그널|추세\s*이탈|물려|본절/;

const readJson = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : d);
const kst = (sec) => new Date((sec + 9 * 3600) * 1000).toISOString().replace('T', ' ').slice(5, 16);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 방송에서 쓰는 별칭 → 사전의 공식 이름. "엑스알피(리플)" 같은 괄호 표기는 양쪽 다 별칭으로 만든다.
export function buildAliases(upbit = {}) {
  const a = { 비트: '비트코인', 비코: '비트코인', 이더: '이더리움', 도지: '도지코인', 솔: '솔라나', 하이닉스: 'SK하이닉스', 삼전: '삼성전자', 현차: '현대차' };
  for (const k of Object.keys(upbit)) {
    const m = k.match(/^(.+?)\((.+)\)$/);
    if (m) { a[m[1]] = k; a[m[2]] = k; }
  }
  return a;
}
let ALIASES = buildAliases();

// 종목 사전 → 이름 찾기 정규식(긴 이름 우선). 두 글자 주식명(기아·한화·대상…)은 일상어와 겹쳐 제외.
export function buildNameRegex(krx = {}, upbit = {}) {
  ALIASES = buildAliases(upbit);
  const names = [...Object.keys(krx).filter((n) => n.length >= 3), ...Object.keys(upbit).filter((n) => n.length >= 2), ...Object.keys(ALIASES)];
  const uniq = [...new Set(names)].sort((a, b) => b.length - a.length);
  // 앞에 한글·영문·숫자가 붙어 있으면 다른 단어의 일부("하이닉스" 안의 "이닉스")이므로 제외
  return uniq.length ? new RegExp(`(?<![가-힣A-Za-z0-9])(${uniq.map(esc).join('|')})`, 'g') : /$^/;
}

// 말투 → 콜 표기. 파서가 아는 단어(매수·손절·목표)로 바꾼다.
export function normalizeSpeech(t) {
  return String(t)
    .replace(/\s+/g, ' ')
    .replace(/(사도\s*(?:돼|되|됩)\w*|사셔도|사세요|사시면|사시고|사면|사고요|사고|사는\s*거|사서|삽니다|살\s*만|담아|담으|담고|줍|매집|들어가(?:도|세요|면|시)|진입)/g, ' 매수 ')
    // "78.6원 4시간 종가로 봤을 때 여기 이탈하면" → "78.6원 손절 4시간 종가로…" (가격과 '이탈하면' 사이에 기준 설명이 끼는 말투)
    .replace(/(\d[\d.]*\s*(?:억|만|천)?\s*원?)\s+((?:[^\d]|\d+\s*(?:시간|분|일)\s*(?:봉|종가)?){0,40}?)\s*(깨지면|이탈하면|빠지면|무너지면|하회하면)/g, '$1 손절 $2 ')
    .replace(/(깨지면|이탈하면|빠지면|무너지면|하회하면|밑으로\s*가면)\s*(?:나가|매도|정리|손절|컷|던지)\w*/g, ' 손절 ')
    .replace(/(깨지면|이탈하면|빠지면|무너지면)/g, ' 손절 ')
    .replace(/(?:손절|컷|스탑)\s*(?:은|는|가|을|를)?\s*/g, ' 손절 ')
    // "손절 6만 8천" (말로는 앞에 오는 형태) → "6만 8천 손절" — 파서는 가격 뒤의 손절을 먼저 찾는다
    .replace(/손절\s+((?:\d[\d.]*\s*(?:억|만|천)?\s*(?:원)?(?![\d가-힣])\s*){1,2})/g, (_, p) => ` ${p.trim()} 손절 `)
    // "7만 원 근처면/부근에서" 같은 현재가 근사치는 목표가로 오인되므로 지운다(진입은 '지금 매수' 앵커가 담당)
    .replace(/\d[\d.]*\s*(?:억|만|천)?\s*원?\s*(?:근처|부근|쯤|언저리)\s*(?:이면|면|에서|에|로|은|는)?/g, ' ')
    .replace(/(?:목표|익절)\s*(?:는|은|가|를|을)?\s*/g, ' 목표 ')
    .replace(/(?:까지는?\s*(?:갈|열|보|가능))/g, ' 목표 ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractFromSegments(segs, nameRe, rules = RULES) {
  const found = [];
  for (let i = 0; i < segs.length; i++) {
    const m = segs[i].text.match(nameRe);
    if (!m) continue;
    const raw = [...new Set(m)][0];
    const name = ALIASES[raw] ?? raw;
    // 다른 종목 이름이 나오는 자막인지(창을 거기서 자른다 — 두 종목의 매수 표현·손절·목표가 섞이지 않게)
    const other = (s) => { const mm = s.text.match(nameRe); return mm && mm.some((x) => (ALIASES[x] ?? x) !== name); };
    // 짧은 창(이름 자막 앞 1·뒤 3구간, 약 -15초~+40초, 다른 종목에서 자름): 여기에 명시적 매수 표현이 있고 복기·보유 표현이 없어야 한다
    let nlo = i;
    while (nlo > Math.max(0, i - 1) && !other(segs[nlo - 1])) nlo--;
    let nhi = i;
    while (nhi < Math.min(segs.length - 1, i + 3) && !other(segs[nhi + 1])) nhi++;
    const near = segs.slice(nlo, nhi + 1).map((s) => s.text).join(' ');
    if (!BUY_CUE.test(near) || PAST_CUE.test(near)) continue;
    if (AMBIGUOUS.has(raw) && !/코인/.test(near)) continue;
    // 창: 앞 BEFORE·뒤 AFTER 구간. 단, 다른 종목 이름이 나오는 구간에서 자른다
    let lo = i;
    while (lo > Math.max(0, i - BEFORE) && !other(segs[lo - 1])) lo--;
    let hi = i;
    while (hi < Math.min(segs.length - 1, i + AFTER) && !other(segs[hi + 1])) hi++;
    const win = segs.slice(lo, hi + 1).map((s) => s.text).join(' ');
    const nt = normalizeSpeech(win);
    if (!/매수/.test(nt) || !/(손절|목표)/.test(nt)) continue;
    const body = nt.replace(nameRe, ' ');
    let p = parseCall(body, rules);
    // 말로는 "손절 300 목표 400 지금 사세요"처럼 진입 표현이 뒤에 올 수 있다 → 파서는 진입 뒤만 보므로 진입을 앞으로 옮겨 다시 해석
    if (p.entryMode == null || (p.sl == null && !p.tps.length)) {
      const moved = '현재가 매수 ' + body.replace(/(?:지금|현재가|여기서|이\s*자리에서)?\s*매수/g, ' ');
      const q = parseCall(moved, rules);
      if (q.entryMode != null && (q.sl != null || q.tps.length)) p = q;
    }
    if (p.entryMode == null || (p.sl == null && !p.tps.length)) continue;
    const key = `${name}|${p.sl ?? ''}|${p.tps[0]?.price ?? ''}`;
    if (found.some((f) => f.key === key && Math.abs(f.t - segs[i].t) < 900)) continue;
    const parts = [name, p.entryMode === 'MARKET' ? '현재가' : `${p.entry}원`, '매수', '손절', p.sl != null ? `${p.sl}원` : '미제시'];
    if (p.tps.length) parts.push('목표', ...p.tps.map((x) => `${x.price}원`));
    if (!p.flags.some((f) => /기간 표기 없음/.test(f))) parts.push(`${p.horizonDays}일`);
    if (p.stopBasis === 'CLOSE') parts.push(p.stopHours === 24 ? '일봉종가' : `${p.stopHours}시간종가`);
    found.push({ key, name, t: segs[i].t, line: parts.join(' '), ok: p.ok, quote: win.slice(0, 200) });
  }
  return found;
}

async function main() {
  const dry = process.argv.includes('--dry');
  const nameRe = buildNameRegex(readJson(path.join(DATA, 'krx_list.json'), {}), readJson(path.join(DATA, 'upbit_markets.json'), {}));
  const state = readJson(STATE, { videos: {} });
  const live = readJson(FILE, { name: '방송(직접 기록)', messages: [] });
  if (!fs.existsSync(VOD)) { console.log('방송 자막 폴더가 없습니다(yt_live.py 먼저).'); return; }
  // 규칙이 바뀌었으면 예전 규칙으로 뽑은 자동추출 기록을 지우고 모든 자막을 다시 뽑는다(직접 기록·취소는 그대로)
  if ((state.rulesVersion ?? 1) !== RULES_VERSION) {
    const before = live.messages.length;
    live.messages = live.messages.filter((x) => x.channel !== CHANNEL);
    console.log(`추출 규칙 v${RULES_VERSION} 적용: 예전 자동추출 ${before - live.messages.length}건을 지우고 전체 자막을 다시 뽑습니다.`);
    state.videos = {};
    state.rulesVersion = RULES_VERSION;
    if (!dry) { fs.writeFileSync(FILE, JSON.stringify(live, null, 1)); fs.writeFileSync(STATE, JSON.stringify(state, null, 1)); }
  }
  const todo = fs.readdirSync(VOD).filter((f) => f.endsWith('.json') && !state.videos[f.slice(0, -5)]);
  if (!todo.length) { console.log('새 방송 자막이 없습니다.'); return; }
  const summary = [];
  for (const f of todo) {
    const id = f.slice(0, -5);
    const v = readJson(path.join(VOD, f), {});
    const segs = v.segments || [];
    const start = Number(v.startUnix) || 0;
    console.log(`▶ ${(v.title || id).slice(0, 50)} — 자막 ${segs.length}구간`);
    const found = extractFromSegments(segs, nameRe);
    found.forEach((c, k) => {
      const t = start ? start + Math.floor(c.t) : 0;
      summary.push(`· ${t ? kst(t) : '시각미상'} ${c.line}${c.ok ? '' : ' (정보 부족 → 검토)'}`);
      if (!dry) live.messages.push({
        id: `vod${id}_${k + 1}`, type: 'message', channel: CHANNEL, date_precision: start ? 'exact' : 'unknown',
        date: t ? new Date(t * 1000).toISOString() : '', date_unixtime: String(t), name: c.name, text: c.line,
        quote: c.quote, confidence: 'rule', video: id,
      });
    });
    console.log(`  → 타점 후보 ${found.length}건${dry ? ' (dry)' : ' 기록'}`);
    if (!dry) state.videos[id] = { calls: found.length, at: new Date().toISOString(), title: v.title, mode: 'rules' };
  }
  if (!dry) {
    fs.writeFileSync(FILE, JSON.stringify(live, null, 1));
    fs.writeFileSync(STATE, JSON.stringify(state, null, 1));
  }
  if (!summary.length) { console.log('숫자로 제시된 타점을 찾지 못했습니다.'); return; }
  const text = `📺 방송 자막 자동추출(규칙) 타점\n${summary.slice(0, 30).join('\n')}\n\n자막 오인이 있을 수 있어요. 틀린 건 '취소 <종목>' 으로 지우세요.`;
  if (dry) console.log(text);
  else console.log((await notifyText(text)) ? '텔레그램 요약 전송' : '(텔레그램 봇 미설정 — 요약 생략)');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.log(`✖ ${e.message}`); process.exit(1); });
}

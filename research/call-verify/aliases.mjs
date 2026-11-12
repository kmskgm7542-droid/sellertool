// 종목 별칭 사전 — 자막·말로는 다르게 들리는 이름("저스택")을 사전의 공식 이름("제이스텍")으로 잇는다.
//   파일: data/aliases.json  { "저스택": "제이스텍", "스키드": "스퀴드" }
//   등록: 텔레그램 봇에 "별칭 저스택=제이스텍" (또는 "별칭 저스택 제이스텍"), 삭제 "별칭 삭제 저스택", 목록 "별칭"
//   적용: 방송 자막 자동추출(extract_rules.mjs)과 직접 기록(live.mjs) 둘 다. 별칭이 바뀌면 자막 전체를 다시 뽑는다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(HERE, 'data');
const FILE = path.join(DATA, 'aliases.json');
const EXTRACT_STATE = path.join(DATA, 'extract_state.json');

// 기본 별칭 — 방송·게시판에서 반복해서 다르게 불리는 이름(자막 대조로 확인한 것만). 봇으로 등록한 별칭이 우선한다.
//   영문·숫자 약칭(ICTK·LK3), 들리는 대로 적힌 이름(엑시스·오픈 내저), 게시글 오타(크래딧코인)
export const DEFAULT_ALIASES = {
  ICTK: '아이씨티케이',
  LK3: 'LK삼양',
  'LK 3': 'LK삼양',
  엑시스로보틱스: '액시스로보틱스',
  '엑시스 로보틱스': '액시스로보틱스',
  엑시스: '액시스로보틱스',
  오픈내저: '오픈렛저',
  '오픈 내저': '오픈렛저',
  크래딧코인: '크레딧코인',
};

// 봇으로 등록한 별칭(data/aliases.json)만 — 등록·삭제·목록용
function readUserFile() {
  try {
    const j = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return j && typeof j === 'object' ? j : {};
  } catch {
    return {};
  }
}

// 추출·원장 파싱에 쓰는 별칭: 기본 별칭 + 봇 등록 별칭(등록한 쪽이 우선)
export function loadUserAliases() {
  return { ...DEFAULT_ALIASES, ...readUserFile() };
}

function save(a) {
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(a, null, 1));
  // 별칭이 바뀌면 다음 추출에서 지난 방송 자막을 전부 다시 뽑는다(규칙 버전 표시를 지워 재추출을 유도)
  try {
    const st = JSON.parse(fs.readFileSync(EXTRACT_STATE, 'utf8'));
    delete st.rulesVersion;
    fs.writeFileSync(EXTRACT_STATE, JSON.stringify(st, null, 1));
  } catch { /* 아직 추출 상태 없음 */ }
}

export function addAlias(from, to) {
  const a = readUserFile();
  a[from] = to;
  save(a);
  return a;
}

export function removeAlias(from) {
  const a = readUserFile();
  const had = from in a;
  delete a[from];
  if (had) save(a);
  return had;
}

// "별칭 저스택=제이스텍" / "별칭 저스택 제이스텍" / "별칭 삭제 저스택" / "별칭" 해석. 아니면 null.
export function parseAliasCommand(text) {
  const t = String(text).trim();
  if (!/^별칭/.test(t)) return null;
  const rest = t.replace(/^별칭\s*/, '').trim();
  if (!rest) return { kind: 'alias-list' };
  const del = rest.match(/^(?:삭제|제거|지우기)\s+(\S+)$/);
  if (del) return { kind: 'alias-del', from: del[1] };
  const m = rest.match(/^(\S+?)\s*[=→>:]\s*(\S+)$/) || rest.match(/^(\S+)\s+(\S+)$/);
  if (m) return { kind: 'alias-add', from: m[1].replace(/^#/, ''), to: m[2].replace(/^#/, '') };
  return { kind: 'alias-help' };
}

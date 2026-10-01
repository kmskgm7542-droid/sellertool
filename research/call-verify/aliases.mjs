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

export function loadUserAliases() {
  try {
    const j = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return j && typeof j === 'object' ? j : {};
  } catch {
    return {};
  }
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
  const a = loadUserAliases();
  a[from] = to;
  save(a);
  return a;
}

export function removeAlias(from) {
  const a = loadUserAliases();
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

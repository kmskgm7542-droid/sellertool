// 김이사 대행 수신함 처리 — drive_inbox.py 가 받아 둔 data/inbox/inbox_*.txt 의 줄을 봇 명령과 똑같이 처리한다(대표 승인 2026-11-25).
//   한 줄 = 봇에 보내는 한 줄(콜 기록·"@월/일 시:분" 소급·취소·관심 …·별칭). '#'으로 시작하는 줄은 설명이라 건너뛴다.
//   콜은 채널 '방송(김이사 대조)'로 기록 — 대표가 직접 기록한 콜과 성과를 나눠 본다. 처리 결과는 텔레그램으로 "🤖 김이사 대행"으로 알린다.
//   처리한 파일은 data/inbox/done/ 으로 옮긴다. 실행: node inbox.mjs (vod_run·daily_run)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleUpdate, makeLookup, notifyText } from './live.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INBOX = path.join(HERE, 'data', 'inbox');
export const INBOX_CHANNEL = '방송(김이사 대조)';
// 대행으로 처리할 수 있는 명령만(그 밖의 줄은 건너뛴다)
export const allowed = (line) => /^(취소|관심|별칭)/.test(line) || /(매수|진입)/.test(line);

export async function processText(text, tag, ctx) {
  const lines = String(text).split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));
  const out = [];
  let n = 0;
  for (const line of lines) {
    n++;
    if (!allowed(line)) { out.push(`· 건너뜀(허용 안 된 명령): ${line.slice(0, 40)}`); continue; }
    const replies = [];
    const c = { ...ctx, reply: async (t) => replies.push(t) };
    await handleUpdate({ message: { chat: { id: ctx.chatId }, message_id: `${tag}_${n}`, date: Math.floor(Date.now() / 1000), text: line } }, c);
    ctx.lookup = c.lookup;
    out.push(replies.length ? replies.join('\n') : `· 처리됨(답 없음): ${line.slice(0, 40)}`);
  }
  return out;
}

async function main() {
  if (!fs.existsSync(INBOX)) { console.log('수신함 없음'); return; }
  const files = fs.readdirSync(INBOX).filter((f) => /^inbox_.*\.txt$/.test(f)).sort();
  if (!files.length) { console.log('수신함 새 명령 없음'); return; }
  fs.mkdirSync(path.join(INBOX, 'done'), { recursive: true });
  const ctx = { chatId: 'inbox', lookup: makeLookup(), channel: INBOX_CHANNEL };
  const report = [];
  for (const f of files) {
    const out = await processText(fs.readFileSync(path.join(INBOX, f), 'utf8'), f.replace(/\.txt$/, ''), ctx);
    report.push(`[${f}]`, ...out);
    fs.renameSync(path.join(INBOX, f), path.join(INBOX, 'done', f));
    console.log(`${f}: ${out.length}줄 처리`);
  }
  const text = `🤖 김이사 대행 처리 ${files.length}건\n${report.join('\n')}\n틀린 건 "취소 종목" / "관심 삭제 종목"으로 지우세요.`;
  console.log((await notifyText(text)) ? '텔레그램 전송' : '(봇 미설정 — 전송 생략)');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.log(`✖ ${e.message}`); process.exit(1); });
}

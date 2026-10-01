// PC의 publish.py 가 주간 결과(results.json)를 올리는 곳.
//   POST /api/calls/ingest   헤더 x-ingest-key: <키>, 본문 = results.json
//   GET  /api/calls/ingest   같은 헤더 → 연결 확인용 {ok, store, mode}
// 키 두 종류: (기본) setup_site.bat 이 만든 48자 비밀 주소 키 → /calls/<키> 에서 본다. 환경변수 불필요.
//            (옛 방식) Vercel 환경변수 CALLS_INGEST_KEY → 비밀번호 보호 /calls 에서 본다.
import { NextRequest, NextResponse } from 'next/server';
import { resolveIngestNamespace } from '@/lib/calls/auth';
import { isStoreConfigured, saveSnapshot, StoreNotConfigured, validateSnapshot } from '@/lib/calls/store';

const MAX_BYTES = 4 * 1024 * 1024;

function unauthorized() {
  return NextResponse.json({ ok: false, error: '키 형식이 맞지 않습니다(setup_site.bat 이 만든 48자 키 또는 CALLS_INGEST_KEY)' }, { status: 401 });
}

export async function GET(req: NextRequest) {
  const ns = resolveIngestNamespace(req.headers.get('x-ingest-key'));
  if (ns === null) return unauthorized();
  return NextResponse.json({ ok: true, store: isStoreConfigured() ? 'ready' : 'missing', mode: ns ? 'link' : 'password' });
}

export async function POST(req: NextRequest) {
  const ns = resolveIngestNamespace(req.headers.get('x-ingest-key'));
  if (ns === null) return unauthorized();
  const len = Number(req.headers.get('content-length') || 0);
  if (len > MAX_BYTES) return NextResponse.json({ ok: false, error: '본문이 너무 큽니다' }, { status: 413 });

  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BYTES) return NextResponse.json({ ok: false, error: '본문이 너무 큽니다' }, { status: 413 });
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON 이 아닙니다' }, { status: 400 });
  }
  if (!validateSnapshot(body)) {
    return NextResponse.json({ ok: false, error: 'results.json 형식이 아닙니다(version 1)' }, { status: 422 });
  }
  try {
    const history = await saveSnapshot(body, ns);
    return NextResponse.json({ ok: true, week: body.week, weeks: history.length, filled: body.stats.A.filled, mode: ns ? 'link' : 'password' });
  } catch (e) {
    if (e instanceof StoreNotConfigured) return NextResponse.json({ ok: false, error: e.message }, { status: 503 });
    // 저장소 오류(자격 증명·네트워크)는 원인을 그대로 돌려줘 PC 쪽 publish.py 가 보여주게 한다.
    return NextResponse.json({ ok: false, error: `저장 실패: ${(e as Error).message ?? String(e)}` }, { status: 500 });
  }
}

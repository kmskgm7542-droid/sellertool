// PC의 publish.py 가 주간 결과(results.json)를 올리는 곳.
//   POST /api/calls/ingest   헤더 x-ingest-key: <CALLS_INGEST_KEY>, 본문 = results.json
//   GET  /api/calls/ingest   같은 헤더 → 연결 확인용 {ok, store}
import { NextRequest, NextResponse } from 'next/server';
import { verifyIngestKey } from '@/lib/calls/auth';
import { isStoreConfigured, saveSnapshot, StoreNotConfigured, validateSnapshot } from '@/lib/calls/store';

const MAX_BYTES = 4 * 1024 * 1024;

function unauthorized() {
  return NextResponse.json({ ok: false, error: '키가 틀렸습니다' }, { status: 401 });
}

export async function GET(req: NextRequest) {
  if (!verifyIngestKey(req.headers.get('x-ingest-key'))) return unauthorized();
  return NextResponse.json({ ok: true, store: isStoreConfigured() ? 'ready' : 'missing' });
}

export async function POST(req: NextRequest) {
  if (!verifyIngestKey(req.headers.get('x-ingest-key'))) return unauthorized();
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
    const history = await saveSnapshot(body);
    return NextResponse.json({ ok: true, week: body.week, weeks: history.length, filled: body.stats.A.filled });
  } catch (e) {
    if (e instanceof StoreNotConfigured) return NextResponse.json({ ok: false, error: e.message }, { status: 503 });
    // 저장소 오류(자격 증명·네트워크)는 원인을 그대로 돌려줘 PC 쪽 publish.py 가 보여주게 한다.
    return NextResponse.json({ ok: false, error: `저장 실패: ${(e as Error).message ?? String(e)}` }, { status: 500 });
  }
}

import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { isSiteKey, siteNamespace } from '@/lib/calls/auth';
import { isStoreConfigured, loadHistory, loadLatest } from '@/lib/calls/store';
import type { HistoryEntry, Snapshot } from '@/types/calls';
import Dashboard, { Notice } from '@/components/calls/dashboard';

// 비밀 주소 방식(기본). /calls/<48자 키> — 키를 아는 사람만 본다. Vercel 환경변수 불필요.
// 키는 PC의 setup_site.bat 이 만들고(data/site.json), publish.py 가 같은 키로 올린다. 서버는 키의 해시로만 저장 위치를 정한다.
export default async function CallsByKeyPage({ params }: { params: Promise<{ key: string }> }) {
  await connection();
  const { key } = await params;
  if (!isSiteKey(key)) notFound();
  if (!isStoreConfigured()) {
    return <Notice title="저장소가 연결되지 않았습니다" body={'Vercel 프로젝트 → Storage → Blob 저장소를 만들어 연결한 뒤 다시 배포하세요.'} />;
  }
  const ns = siteNamespace(key);
  let s: Snapshot | null = null;
  let history: HistoryEntry[] = [];
  try {
    [s, history] = await Promise.all([loadLatest(ns), loadHistory(ns)]);
  } catch (e) {
    return <Notice title="저장소 읽기 실패" body={String((e as Error).message ?? e)} />;
  }
  if (!s) {
    return (
      <Notice
        title="아직 올라온 성적표가 없습니다"
        body={'이 주소에 연결된 업로드가 아직 없습니다.\nPC에서 setup_site.bat 을 실행(Enter, Enter)하면 첫 성적표가 올라오고, 이후 매주 weekly_run.bat 이 자동으로 갱신합니다.'}
      />
    );
  }
  return <Dashboard s={s} history={history} />;
}

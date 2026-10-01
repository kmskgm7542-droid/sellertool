import { cookies } from 'next/headers';
import { connection } from 'next/server';
import { isConfigured, SESSION_COOKIE, verifySession } from '@/lib/calls/auth';
import { isStoreConfigured, loadHistory, loadLatest } from '@/lib/calls/store';
import type { HistoryEntry, Snapshot } from '@/types/calls';
import LoginForm from '@/components/calls/login-form';
import Dashboard, { Notice } from '@/components/calls/dashboard';

// 옛 방식(비밀번호 보호). 환경변수 CALLS_PASSWORD·CALLS_INGEST_KEY 가 있을 때만 동작한다.
// 기본 방식은 비밀 주소 /calls/<키> (환경변수 불필요) — app/calls/[key]/page.tsx
export default async function CallsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  // 항상 요청 시점에 렌더링(환경변수·저장소 상태를 빌드 시점에 굳히지 않는다)
  await connection();
  if (!isConfigured()) {
    return (
      <Notice
        title="비밀 주소로 열어 주세요"
        body={'이 페이지는 PC의 setup_site.bat 이 알려주는 주소(/calls/긴코드)로 봅니다.\n주소를 잊었으면 PC에서 setup_site.bat 을 다시 실행하면 같은 주소를 다시 보여줍니다.'}
      />
    );
  }
  const store = await cookies();
  if (!verifySession(store.get(SESSION_COOKIE)?.value)) {
    const { error } = await searchParams;
    return <LoginForm error={error === '1'} />;
  }
  if (!isStoreConfigured()) {
    return <Notice title="저장소가 연결되지 않았습니다" body={'Vercel 프로젝트 → Storage → Blob 저장소를 만들어 연결한 뒤 다시 배포하세요.'} />;
  }

  let s: Snapshot | null = null;
  let history: HistoryEntry[] = [];
  try {
    [s, history] = await Promise.all([loadLatest(), loadHistory()]);
  } catch (e) {
    return <Notice title="저장소 읽기 실패" body={String((e as Error).message ?? e)} />;
  }
  if (!s) {
    return <Notice title="아직 올라온 성적표가 없습니다" body={'PC에서 setup_site.bat 로 연결한 뒤 weekly_run.bat 을 한 번 실행하면 여기에 표시됩니다.'} />;
  }
  return <Dashboard s={s} history={history} />;
}

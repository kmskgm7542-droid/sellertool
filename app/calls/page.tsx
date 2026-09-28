import { cookies } from 'next/headers';
import { connection } from 'next/server';
import { isConfigured, SESSION_COOKIE, verifySession } from '@/lib/calls/auth';
import { isStoreConfigured, loadHistory, loadLatest } from '@/lib/calls/store';
import type { HistoryEntry, Snapshot } from '@/types/calls';
import LoginForm from '@/components/calls/login-form';
import TopBanner from '@/components/calls/top-banner';
import VerdictCard from '@/components/calls/verdict-card';
import EquityChart from '@/components/calls/equity-chart';
import HistoryTable from '@/components/calls/history-table';
import CallsTable from '@/components/calls/calls-table';
import OpenPositions from '@/components/calls/open-positions';
import GroupTable from '@/components/calls/group-table';
import RulesPanel from '@/components/calls/rules-panel';

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-16">
      <h1 className="text-lg font-bold">{title}</h1>
      <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{body}</p>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-2 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default async function CallsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  // 항상 요청 시점에 렌더링(환경변수·저장소 상태를 빌드 시점에 굳히지 않는다)
  await connection();
  if (!isConfigured()) {
    return <Notice title="설정이 필요합니다" body={'Vercel 환경변수 CALLS_PASSWORD, CALLS_INGEST_KEY 를 넣고 다시 배포하세요.'} />;
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

  return (
    <>
      <TopBanner generatedAt={s.generatedAt} week={s.week} />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-4">
        <VerdictCard s={s} history={history} />
        <Section title="자산 곡선">
          <EquityChart A={s.equity.A} B={s.equity.B} />
        </Section>
        <Section title="주차별 추이">
          <HistoryTable history={history} />
        </Section>
        <Section title={`보유중 (${s.calls.filter((c) => c.status === 'OPEN').length})`}>
          <OpenPositions calls={s.calls} asOf={Date.parse(s.generatedAt) / 1000} />
        </Section>
        <Section title={`콜 목록 (대상 ${s.counts.usable} · 원장 ${s.counts.ledger})`}>
          <CallsTable calls={s.calls} />
        </Section>
        <Section title="시장별">
          <GroupTable groups={s.byMarket} />
        </Section>
        <Section title="채널별">
          <GroupTable groups={s.byChannel} labels={{}} />
        </Section>
        <Section title={`검토 필요 (${s.pending.length})`}>
          {s.pending.length ? (
            <ul className="text-xs sm:text-sm">
              {s.pending.map((p) => (
                <li key={p.id} className="border-t border-border py-1 first:border-0">
                  <span className="text-muted-foreground">{p.t}</span> {p.name} <span className="text-muted-foreground">— {p.why}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">없음</p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">목표가·종목이 없는 콜은 원장에 넣지 않는다. 채널이 보완하면 다음 주 자동 반영.</p>
        </Section>
        <RulesPanel rules={s.rules} />
        <p className="pb-6 text-center text-xs text-muted-foreground">본인 검증용 · 재배포 금지 · 콜 원문은 저장하지 않음</p>
      </main>
    </>
  );
}

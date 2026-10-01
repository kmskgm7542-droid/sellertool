import type { HistoryEntry, Snapshot } from '@/types/calls';
import TopBanner from '@/components/calls/top-banner';
import VerdictCard from '@/components/calls/verdict-card';
import EquityChart from '@/components/calls/equity-chart';
import HistoryTable from '@/components/calls/history-table';
import CallsTable from '@/components/calls/calls-table';
import OpenPositions from '@/components/calls/open-positions';
import GroupTable from '@/components/calls/group-table';
import RulesPanel from '@/components/calls/rules-panel';

export function Notice({ title, body }: { title: string; body: string }) {
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

// 성적표 본문. 비밀번호 방식(/calls)과 비밀 주소 방식(/calls/<키>)이 같이 쓴다.
export default function Dashboard({ s, history }: { s: Snapshot; history: HistoryEntry[] }) {
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

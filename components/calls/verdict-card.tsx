import type { HistoryEntry, Snapshot } from '@/types/calls';
import { fx, n, pct, verdictTone } from '@/lib/calls/format';

// 체결 50건까지 남은 주 수 추정: 최근 4주 체결 증가 속도, 없으면 첫 콜 이후 평균 속도.
export function estimateWeeksToTarget(s: Snapshot, history: HistoryEntry[]): number | null {
  const need = Number(s.rules.CRITERIA.minFilled ?? 50);
  const filled = s.stats.A.filled;
  if (filled >= need) return 0;
  let perWeek: number | null = null;
  const recent = history.slice(-5);
  if (recent.length >= 2) {
    const weeks = recent.length - 1;
    const gained = recent[recent.length - 1].filled - recent[0].filled;
    if (gained > 0) perWeek = gained / weeks;
  }
  if (perWeek === null) {
    const first = Math.min(...s.calls.map((c) => c.postedAt).filter(Boolean));
    const weeks = Math.max(1, (Date.parse(s.generatedAt) / 1000 - first) / (7 * 86400));
    if (filled > 0 && Number.isFinite(weeks)) perWeek = filled / weeks;
  }
  if (!perWeek || perWeek <= 0) return null;
  return Math.ceil((need - filled) / perWeek);
}

const TONE = {
  pass: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  fail: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
  na: 'border-border bg-muted text-muted-foreground',
};

function gauge(key: string, c: { pass: boolean; value: Snapshot['stats']['A']['checks'][string]['value']; need: string }) {
  const v = n(c.value);
  let text = '-';
  let ratio = 0;
  const num = Number(c.need.replace(/[^\d.-]/g, ''));
  if (key === '표본') { text = `${v ?? 0} / ${num}`; ratio = v === null ? 0 : v / num; }
  else if (key === '기대값') { text = `${fx(c.value)}R`; ratio = v === null ? 0 : v > 0 ? 1 : 0; }
  else if (key === 't값') { text = `${fx(c.value)} / ${num}`; ratio = v === null ? 0 : v / num; }
  else if (key === 'PF') { text = `${fx(c.value)} / ${num}`; ratio = c.value === 'inf' ? 1 : v === null ? 0 : v / num; }
  else if (key === '최대낙폭') { text = `${pct(c.value)} (한도 ${num}%)`; ratio = v === null ? 0 : 1 - Math.min(1, Math.abs(v) / Math.abs(num / 100)); }
  return { text, ratio: Math.max(0, Math.min(1, ratio)) };
}

export default function VerdictCard({ s, history }: { s: Snapshot; history: HistoryEntry[] }) {
  const a = s.stats.A;
  const tone = verdictTone(a.verdict);
  const eta = estimateWeeksToTarget(s, history);
  return (
    <section className={`rounded-xl border p-4 ${TONE[tone]}`}>
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-bold">{a.verdict}</h2>
        <span className="text-xs">A안 · 전체 콜 기준</span>
      </div>
      <p className="mt-1 text-sm">
        체결 {a.filled}건 · 승률 {pct(a.winRate)} · 평균 {fx(a.meanR)}R · PF {fx(a.pf)} · MDD {pct(a.mdd)}
        {a.requiredN ? ` · t≥2까지 필요 표본 ${a.requiredN}` : ''}
      </p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {Object.entries(a.checks).map(([k, c]) => {
          const g = gauge(k, c);
          return (
            <li key={k} className="rounded-md bg-background/70 p-2 text-foreground">
              <div className="flex justify-between text-xs">
                <span className="font-semibold">{c.pass ? '✅' : '⬜'} {k}</span>
                <span className="text-muted-foreground">{g.text}</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-muted">
                <div className={`h-full ${c.pass ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${g.ratio * 100}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-foreground/80">
        {eta === 0
          ? '표본 목표 도달.'
          : eta === null
            ? '체결 속도를 아직 추정할 수 없습니다.'
            : `현재 속도면 체결 ${Number(s.rules.CRITERIA.minFilled ?? 50)}건까지 약 ${eta}주.`}{' '}
        합격 후에도 4~8주 전향 확인 → 페이퍼 → 소액 순서.
      </p>
    </section>
  );
}

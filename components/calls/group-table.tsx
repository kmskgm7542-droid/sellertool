import type { StatsOut } from '@/types/calls';
import { fx, MARKET_LABEL, pct } from '@/lib/calls/format';

export default function GroupTable({ groups, labels }: { groups: Record<string, StatsOut>; labels?: Record<string, string> }) {
  const entries = Object.entries(groups);
  if (!entries.length) return null;
  return (
    <table className="w-full text-xs sm:text-sm">
      <thead className="text-left text-muted-foreground">
        <tr>
          <th className="py-1 pr-2">구분</th>
          <th className="py-1 pr-2">체결</th>
          <th className="py-1 pr-2">승률</th>
          <th className="py-1 pr-2">평균R</th>
          <th className="py-1 pr-2">PF</th>
          <th className="py-1">MDD</th>
        </tr>
      </thead>
      <tbody>
        {entries.map(([k, s]) => {
          const thin = s.filled < 10;
          return (
            <tr key={k} className={`border-t border-border ${thin ? 'text-muted-foreground' : ''}`}>
              <td className="py-1 pr-2">{(labels ?? MARKET_LABEL)[k] ?? k}{thin ? ' (참고)' : ''}</td>
              <td className="py-1 pr-2">{s.filled}/{s.calls}</td>
              <td className="py-1 pr-2">{pct(s.winRate)}</td>
              <td className="py-1 pr-2">{fx(s.meanR)}</td>
              <td className="py-1 pr-2">{fx(s.pf)}</td>
              <td className="py-1">{pct(s.mdd)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

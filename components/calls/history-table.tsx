import type { HistoryEntry, Num } from '@/types/calls';
import { fx, n, pct } from '@/lib/calls/format';

function arrow(cur: Num, prev: Num | undefined): string {
  const a = n(cur);
  const b = prev === undefined ? null : n(prev);
  if (a === null || b === null) return '';
  if (a > b + 1e-9) return ' ▲';
  if (a < b - 1e-9) return ' ▼';
  return ' –';
}

export default function HistoryTable({ history }: { history: HistoryEntry[] }) {
  if (!history.length) return <p className="text-sm text-muted-foreground">첫 결과가 올라오면 날짜별 추이가 쌓입니다.</p>;
  const rows = [...history].reverse().slice(0, 60);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs sm:text-sm">
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="py-1 pr-2">날짜</th>
            <th className="py-1 pr-2">체결</th>
            <th className="py-1 pr-2">승률</th>
            <th className="py-1 pr-2">평균R</th>
            <th className="py-1 pr-2">t</th>
            <th className="py-1 pr-2">PF</th>
            <th className="py-1 pr-2">MDD</th>
            <th className="py-1">판정</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((h, i) => {
            const prev = rows[i + 1];
            return (
              <tr key={h.day ?? h.week} className="border-t border-border">
                <td className="py-1 pr-2 font-mono">{h.day ?? h.week}</td>
                <td className="py-1 pr-2">{h.filled}{prev ? arrow(h.filled, prev.filled) : ''}</td>
                <td className="py-1 pr-2">{pct(h.winRate)}{prev ? arrow(h.winRate, prev.winRate) : ''}</td>
                <td className="py-1 pr-2">{fx(h.meanR)}{prev ? arrow(h.meanR, prev.meanR) : ''}</td>
                <td className="py-1 pr-2">{fx(h.t)}</td>
                <td className="py-1 pr-2">{fx(h.pf)}</td>
                <td className="py-1 pr-2">{pct(h.mdd)}</td>
                <td className="py-1">{h.verdict.replace('(표본 부족)', '')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

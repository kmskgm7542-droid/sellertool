'use client';

import { useMemo, useState } from 'react';
import type { CallRow } from '@/types/calls';
import { fx, MARKET_LABEL, pct, signedR } from '@/lib/calls/format';
import { periodStats, type PeriodBy, type PeriodUnit } from '@/lib/calls/period';

// 기간별 적중율 — 월·주 단위로, 전체·시장·채널로 나눠 본다. 종료된 콜 기준이며 보유중은 건수만 표시.
export default function PeriodTable({ calls }: { calls: CallRow[] }) {
  const [unit, setUnit] = useState<PeriodUnit>('month');
  const [by, setBy] = useState<PeriodBy>('all');
  const rows = useMemo(() => periodStats(calls, unit, by), [calls, unit, by]);
  const sel = 'rounded border border-input bg-background px-2 py-1 text-xs';
  if (!calls.length) return <p className="text-sm text-muted-foreground">콜이 쌓이면 기간별로 나눠 보여줍니다.</p>;
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-2">
        <select className={sel} value={unit} onChange={(e) => setUnit(e.target.value as PeriodUnit)} aria-label="기간 단위">
          <option value="month">월별</option>
          <option value="week">주별</option>
        </select>
        <select className={sel} value={by} onChange={(e) => setBy(e.target.value as PeriodBy)} aria-label="구분">
          <option value="all">전체</option>
          <option value="market">시장별</option>
          <option value="channel">채널별</option>
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs sm:text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-1 pr-2">기간</th>
              {by !== 'all' && <th className="py-1 pr-2">구분</th>}
              <th className="py-1 pr-2">콜</th>
              <th className="py-1 pr-2">종료</th>
              <th className="py-1 pr-2">승률</th>
              <th className="py-1 pr-2">평균R</th>
              <th className="py-1 pr-2">합계R</th>
              <th className="py-1 pr-2">PF</th>
              <th className="py-1">보유중</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const thin = r.filled < 5;
              return (
                <tr key={`${r.period}|${r.group}`} className={`border-t border-border ${thin ? 'text-muted-foreground' : ''}`}>
                  <td className="py-1 pr-2 font-mono">{r.period}</td>
                  {by !== 'all' && <td className="py-1 pr-2">{by === 'market' ? (MARKET_LABEL[r.group] ?? r.group) : r.group}</td>}
                  <td className="py-1 pr-2">{r.calls}</td>
                  <td className="py-1 pr-2">{r.filled}{thin ? ' (참고)' : ''}</td>
                  <td className="py-1 pr-2">{pct(r.winRate)}</td>
                  <td className="py-1 pr-2">{fx(r.meanR)}</td>
                  <td className={`py-1 pr-2 ${r.sumR > 0 ? 'text-emerald-700 dark:text-emerald-300' : r.sumR < 0 ? 'text-red-700 dark:text-red-300' : ''}`}>{r.filled ? signedR(r.sumR) : '-'}</td>
                  <td className="py-1 pr-2">{fx(r.pf)}</td>
                  <td className="py-1">{r.open || '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">게시 시각 기준으로 묶음. 종료 5건 미만 구간은 참고용.</p>
    </div>
  );
}

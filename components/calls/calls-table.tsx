'use client';

import { useMemo, useState } from 'react';
import type { CallRow } from '@/types/calls';
import { fx, kst, MARKET_LABEL, MODE_LABEL, outcomeLabel, pct, price, reasonLabel, signedR, STATUS_LABEL, stopBasisLabel } from '@/lib/calls/format';

const ALL = '전체';

function tone(c: CallRow): string {
  if (c.status === 'OPEN') return 'text-sky-700 dark:text-sky-300';
  if (c.status !== 'FILLED') return 'text-muted-foreground';
  const r = typeof c.R === 'number' ? c.R : 0;
  return r > 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300';
}

export default function CallsTable({ calls }: { calls: CallRow[] }) {
  const [status, setStatus] = useState(ALL);
  const [market, setMarket] = useState(ALL);
  const [channel, setChannel] = useState(ALL);
  const [month, setMonth] = useState(ALL);
  const [open, setOpen] = useState<string | null>(null);

  const months = useMemo(() => [...new Set(calls.map((c) => c.postedKst.slice(0, 7)))].sort().reverse(), [calls]);
  const channels = useMemo(() => [...new Set(calls.map((c) => c.channel).filter(Boolean))], [calls]);
  const rows = useMemo(
    () =>
      [...calls]
        .filter((c) => (status === ALL || c.status === status) && (market === ALL || c.market === market) && (channel === ALL || c.channel === channel) && (month === ALL || c.postedKst.startsWith(month)))
        .sort((a, b) => b.postedAt - a.postedAt),
    [calls, status, market, channel, month],
  );

  const sel = 'rounded border border-input bg-background px-2 py-1 text-xs';
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-2">
        <select className={sel} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="상태">
          <option>{ALL}</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className={sel} value={market} onChange={(e) => setMarket(e.target.value)} aria-label="시장">
          <option>{ALL}</option>
          {Object.entries(MARKET_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className={sel} value={channel} onChange={(e) => setChannel(e.target.value)} aria-label="채널">
          <option>{ALL}</option>
          {channels.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className={sel} value={month} onChange={(e) => setMonth(e.target.value)} aria-label="월">
          <option>{ALL}</option>
          {months.map((m) => <option key={m}>{m}</option>)}
        </select>
        <span className="self-center text-xs text-muted-foreground">{rows.length}건</span>
      </div>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {rows.map((c) => {
          const isOpen = open === c.id;
          return (
            <li key={c.id}>
              <button type="button" onClick={() => setOpen(isOpen ? null : c.id)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm">
                <span className="min-w-0">
                  <span className="text-xs text-muted-foreground">{c.postedKst.slice(5, 10)} · {MARKET_LABEL[c.market] ?? c.market}</span>
                  <span className="block truncate font-medium">{c.name || c.symbol}</span>
                </span>
                <span className={`shrink-0 text-right font-semibold ${tone(c)}`}>{outcomeLabel(c)}</span>
              </button>
              {isOpen && (
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 bg-muted/40 px-3 py-2 text-xs sm:grid-cols-3">
                  <dt className="text-muted-foreground">게시</dt><dd>{c.postedKst} ({c.channel || '-'})</dd>
                  <dt className="text-muted-foreground">진입 제시</dt><dd>{c.entryMode === 'PRICE' ? price(c.entry, c.market) : '현재가'} → {c.mode ? MODE_LABEL[c.mode] ?? c.mode : '-'}</dd>
                  <dt className="text-muted-foreground">손절</dt><dd>{price(c.sl, c.market)} ({stopBasisLabel(c.stopBasis, c.stopHours)})</dd>
                  <dt className="text-muted-foreground">목표</dt><dd>{c.tps.map((p) => price(p, c.market)).join(' / ')}</dd>
                  <dt className="text-muted-foreground">기간</dt><dd>{c.horizonDays}일</dd>
                  <dt className="text-muted-foreground">체결</dt><dd>{c.fillAt ? `${kst(c.fillAt)} @ ${price(c.fillPrice, c.market)}` : c.skipReason || '-'}</dd>
                  {c.exits.length > 0 && (
                    <>
                      <dt className="text-muted-foreground">청산</dt>
                      <dd className="col-span-1 sm:col-span-2">
                        {c.exits.map((x, i) => (
                          <span key={i} className="mr-2 inline-block">{reasonLabel(x.reason)} {Math.round(x.w * 100)}% @ {price(x.px, c.market)} ({kst(x.t)})</span>
                        ))}
                      </dd>
                    </>
                  )}
                  <dt className="text-muted-foreground">결과</dt><dd>{signedR(c.R, 2)} · 순 {pct(c.net)} · {fx(c.holdDays, 1)}일 · 위험 {pct(c.riskPct)}</dd>
                  <dt className="text-muted-foreground">B안</dt><dd>{signedR(c.RB, 2)}</dd>
                </dl>
              )}
            </li>
          );
        })}
        {!rows.length && <li className="px-3 py-4 text-center text-sm text-muted-foreground">해당 조건의 콜이 없습니다.</li>}
      </ul>
    </div>
  );
}

import type { CallRow } from '@/types/calls';
import { kst, MARKET_LABEL, pct, price, signedR } from '@/lib/calls/format';

// asOf: 스냅샷 생성 시각(초). 남은 일수는 마지막 수집 시점 기준으로 계산한다.
export default function OpenPositions({ calls, asOf }: { calls: CallRow[]; asOf: number }) {
  const open = calls.filter((c) => c.status === 'OPEN');
  if (!open.length) return <p className="text-sm text-muted-foreground">보유중인 콜이 없습니다.</p>;
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {open.map((c) => {
        const hit = new Set(c.exits.filter((x) => /^TP\d/.test(x.reason)).map((x) => Number(x.reason.slice(2))));
        const nextTp = c.tps.find((_, i) => !hit.has(i + 1)) ?? null;
        const last = c.last?.close ?? null;
        const toSl = last ? c.sl / last - 1 : null;
        const toTp = last && nextTp ? nextTp / last - 1 : null;
        const expires = c.fillAt ? c.fillAt + c.horizonDays * 86400 : null;
        const daysLeft = expires ? Math.max(0, Math.ceil((expires - asOf) / 86400)) : null;
        return (
          <li key={c.id} className="rounded-lg border border-border p-3 text-sm">
            <div className="flex items-baseline justify-between">
              <span className="font-medium">{c.name || c.symbol} <span className="text-xs text-muted-foreground">{MARKET_LABEL[c.market] ?? c.market}</span></span>
              <span className="font-semibold text-sky-700 dark:text-sky-300">{signedR(c.R)}</span>
            </div>
            <dl className="mt-1 grid grid-cols-2 gap-x-2 text-xs text-muted-foreground">
              <dt>마지막 시세</dt><dd className="text-foreground">{price(last, c.market)} ({kst(c.last?.t ?? null, false)})</dd>
              <dt>손절까지</dt><dd className="text-foreground">{price(c.sl, c.market)} ({pct(toSl)})</dd>
              <dt>다음 목표</dt><dd className="text-foreground">{nextTp ? `${price(nextTp, c.market)} (${pct(toTp)})` : '전부 도달'}</dd>
              <dt>만료</dt><dd className="text-foreground">{expires ? `${kst(expires, false)} (${daysLeft}일)` : '-'}</dd>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}

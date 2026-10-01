// 기간별(월·주) 적중율 — 종료된 콜(FILLED)의 R 로 계산. 과거 구간을 돌아보며 적중율 변화를 보기 위한 것.
import type { CallRow, Num } from '@/types/calls';

export type PeriodUnit = 'month' | 'week';
export type PeriodBy = 'all' | 'market' | 'channel';

export interface PeriodStat {
  period: string; // '2026-09' 또는 '2026-W40'
  group: string; // '전체' | 시장 | 채널
  calls: number; // 게시 콜 수(검증 대상)
  filled: number; // 종료된 콜
  open: number; // 보유중
  wins: number;
  winRate: Num;
  meanR: Num;
  sumR: number;
  pf: Num;
}

function isoWeek(sec: number): string {
  const d = new Date((sec + 9 * 3600) * 1000); // KST 기준 날짜
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return `${x.getUTCFullYear()}-W${String(Math.ceil(((x.getTime() - y0.getTime()) / 86400000 + 1) / 7)).padStart(2, '0')}`;
}

export function periodOf(c: CallRow, unit: PeriodUnit): string {
  if (unit === 'week') return isoWeek(c.postedAt);
  const d = new Date((c.postedAt + 9 * 3600) * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function periodStats(calls: CallRow[], unit: PeriodUnit = 'month', by: PeriodBy = 'all'): PeriodStat[] {
  type Acc = PeriodStat & { pos: number; neg: number };
  const buckets = new Map<string, Acc>();
  for (const c of calls) {
    if (!c.postedAt) continue;
    const period = periodOf(c, unit);
    const group = by === 'all' ? '전체' : by === 'market' ? c.market : c.channel || '-';
    const key = `${period}|${group}`;
    let b = buckets.get(key);
    if (!b) {
      b = { period, group, calls: 0, filled: 0, open: 0, wins: 0, winRate: null, meanR: null, sumR: 0, pf: null, pos: 0, neg: 0 };
      buckets.set(key, b);
    }
    b.calls += 1;
    if (c.status === 'OPEN') b.open += 1;
    if (c.status === 'FILLED' && typeof c.R === 'number' && Number.isFinite(c.R)) {
      b.filled += 1;
      b.sumR += c.R;
      if (c.R > 0) { b.wins += 1; b.pos += c.R; } else if (c.R < 0) b.neg -= c.R;
    }
  }
  const out: PeriodStat[] = [];
  for (const { pos, neg, ...b } of buckets.values()) {
    if (b.filled) {
      b.winRate = b.wins / b.filled;
      b.meanR = b.sumR / b.filled;
      // 이익 합 / 손실 합. 손실이 없으면 'inf'(표기용), 둘 다 0이면 null
      b.pf = neg > 0 ? pos / neg : pos > 0 ? 'inf' : null;
    }
    b.sumR = Number(b.sumR.toFixed(2));
    out.push(b);
  }
  return out.sort((x, y) => y.period.localeCompare(x.period) || x.group.localeCompare(y.group));
}

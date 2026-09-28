import type { CallRow, Num } from '@/types/calls';

export const n = (x: Num): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);

export function fx(x: Num, d = 2): string {
  if (x === 'inf') return '∞';
  const v = n(x);
  return v === null ? '-' : v.toFixed(d);
}

export function pct(x: Num, d = 1): string {
  const v = n(x);
  return v === null ? '-' : `${(v * 100).toFixed(d)}%`;
}

export function signedR(x: Num, d = 1): string {
  const v = n(x);
  if (v === null) return '-';
  return `${v >= 0 ? '+' : ''}${v.toFixed(d)}R`;
}

// 초 단위 unix → KST "MM-DD HH:MM" / "YYYY-MM-DD"
export function kst(sec: number | null | undefined, withTime = true): string {
  if (!sec) return '-';
  const s = new Date((sec + 9 * 3600) * 1000).toISOString();
  return withTime ? `${s.slice(5, 10)} ${s.slice(11, 16)}` : s.slice(0, 10);
}

export function kstIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return kst(d.getTime() / 1000);
}

export function price(p: number | null | undefined, market: string): string {
  if (p === null || p === undefined || !Number.isFinite(p)) return '-';
  if (market === 'KRX' || p >= 1000) return Math.round(p).toLocaleString('ko-KR');
  if (p >= 1) return p.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
  return p.toLocaleString('ko-KR', { maximumFractionDigits: 4 });
}

export const STATUS_LABEL: Record<string, string> = {
  FILLED: '종료',
  OPEN: '보유중',
  UNFILLED: '미체결',
  SKIPPED: '제외',
  NO_DATA: '시세없음',
};

export function reasonLabel(r: string | null): string {
  if (!r) return '';
  if (r === 'DATA_END') return '보유중';
  if (r === 'EXPIRY') return '기간만료';
  if (r === 'SL_SAMEDAY') return '당일손절';
  if (r === 'SL_CLOSE') return '종가손절';
  if (r === 'SL_GAP') return '갭손절';
  if (r === 'SL') return '손절';
  if (/^TP\d/.test(r)) return `${r.slice(2)}차 목표`;
  return r;
}

export function outcomeLabel(c: CallRow): string {
  if (c.status === 'OPEN') return `보유중 ${signedR(c.R)}`;
  if (c.status !== 'FILLED') return STATUS_LABEL[c.status] ?? c.status;
  const r = c.lastReason ?? '';
  if (/^SL/.test(r)) return `손절 ${signedR(c.R)}`;
  if (/^TP/.test(r)) return `목표 ${signedR(c.R)}`;
  return `만료 ${signedR(c.R)}`;
}

export const MODE_LABEL: Record<string, string> = {
  MARKET: '시장가',
  MARKET_CLOSE: '당일종가',
  LIMIT: '지정가',
  BREAKOUT: '돌파',
};

export function stopBasisLabel(basis: string, hours: number | null): string {
  if (basis !== 'CLOSE') return '터치';
  return hours === 24 ? '일봉 종가' : `${hours ?? 1}시간 종가`;
}

export const MARKET_LABEL: Record<string, string> = { KRX: '국내주식', UPBIT: '업비트' };

export function verdictTone(verdict: string): 'pass' | 'fail' | 'na' {
  if (verdict.startsWith('합격')) return 'pass';
  if (verdict.startsWith('불합격')) return 'fail';
  return 'na';
}

// 콜 검증 성적표 스냅샷 — research/call-verify/run.mjs 의 buildWebSnapshot() 이 만든 data/results.json 형태.
// 숫자 필드는 유한값이 아니면 null, 무한대는 'inf' 문자열.

export type Num = number | 'inf' | null;

export interface CheckResult {
  pass: boolean;
  value: Num;
  need: string;
}

export interface StatsOut {
  calls: number;
  filled: number;
  unfilled: number;
  skipped: number;
  noData: number;
  fillRate: Num;
  winRate: Num;
  meanR: Num;
  medianR: Num;
  sdR: Num;
  t: Num;
  pf: Num;
  mdd: Num;
  finalEquity: Num;
  avgHoldDays: Num;
  incomplete: number;
  maxConcurrent: number | null;
  reasons: Record<string, number>;
  requiredN: number | null;
  verdict: string;
  checks: Record<string, CheckResult>;
}

export interface EquityPoint {
  t: number | null;
  v: number;
  id?: string;
}

export type CallStatus = 'FILLED' | 'OPEN' | 'UNFILLED' | 'SKIPPED' | 'NO_DATA';

export interface CallRow {
  id: string;
  channel: string;
  postedAt: number;
  postedKst: string;
  market: 'KRX' | 'UPBIT' | string;
  symbol: string;
  name: string;
  entryMode: string;
  entry: number | null;
  sl: number;
  tps: number[];
  horizonDays: number;
  stopBasis: string;
  stopHours: number | null;
  status: CallStatus;
  mode: string | null;
  skipReason: string | null;
  fillPrice: number | null;
  fillAt: number | null;
  exitAt: number | null;
  exits: { w: number; px: number; reason: string; t: number }[];
  lastReason: string | null;
  R: Num;
  net: Num;
  holdDays: Num;
  riskPct: Num;
  RB: Num;
  last: { t: number; close: number } | null;
}

export interface PendingRow {
  id: string;
  t: string;
  name: string;
  why: string;
}

export interface Snapshot {
  version: 1;
  generatedAt: string;
  week: string;
  counts: { ledger: number; usable: number; excluded: number };
  stats: { A: StatsOut; B: StatsOut };
  equity: { A: EquityPoint[]; B: EquityPoint[] };
  calls: CallRow[];
  byMarket: Record<string, StatsOut>;
  byChannel: Record<string, StatsOut>;
  pending: PendingRow[];
  rules: { RULES: Record<string, unknown>; COSTS: Record<string, unknown>; CRITERIA: Record<string, unknown> };
}

// 주차별 누적(가벼운 요약만). 저장소의 history.json.
export interface HistoryEntry {
  week: string;
  generatedAt: string;
  usable: number;
  filled: number;
  winRate: Num;
  meanR: Num;
  t: Num;
  pf: Num;
  mdd: Num;
  verdict: string;
}

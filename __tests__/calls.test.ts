import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isSiteKey, resolveIngestNamespace, sessionTokenFor, siteNamespace, verifyIngestKey, verifyPassword, verifySession } from '@/lib/calls/auth';
import { kstDay, loadHistory, loadLatest, saveSnapshot, toHistoryEntry, upsertHistory, validateSnapshot } from '@/lib/calls/store';
import { estimateWeeksToTarget } from '@/components/calls/verdict-card';
import type { HistoryEntry, Snapshot, StatsOut } from '@/types/calls';

const stats = (over: Partial<StatsOut> = {}): StatsOut => ({
  calls: 10, filled: 9, unfilled: 1, skipped: 0, noData: 0, fillRate: 0.9, winRate: 0.44, meanR: 2.1, medianR: 1, sdR: 4.7,
  t: 1.35, pf: 3.7, mdd: -0.03, finalEquity: 1.2, avgHoldDays: 8, incomplete: 3, maxConcurrent: 4, reasons: {}, requiredN: 20,
  verdict: '판정 불가(표본 부족)', checks: { 표본: { pass: false, value: 9, need: '≥ 50' } }, ...over,
});

const snap = (over: Partial<Snapshot> = {}): Snapshot => ({
  version: 1, generatedAt: '2026-09-28T04:48:00.000Z', week: '2026-W40', counts: { ledger: 18, usable: 10, excluded: 8 },
  stats: { A: stats(), B: stats() }, equity: { A: [{ t: null, v: 1 }], B: [{ t: null, v: 1 }] },
  calls: [], byMarket: {}, byChannel: {}, pending: [], rules: { RULES: {}, COSTS: {}, CRITERIA: { minFilled: 50 } }, ...over,
});

describe('calls auth', () => {
  const env = process.env;
  beforeEach(() => { process.env = { ...env, CALLS_PASSWORD: 'pw-secret', CALLS_INGEST_KEY: 'k'.repeat(32) }; });
  afterAll(() => { process.env = env; });

  it('세션 토큰은 비밀번호에서 결정적으로 나오고 비밀번호가 바뀌면 달라진다', () => {
    expect(sessionTokenFor('a')).toBe(sessionTokenFor('a'));
    expect(sessionTokenFor('a')).not.toBe(sessionTokenFor('b'));
    expect(sessionTokenFor('a')).toMatch(/^[0-9a-f]{64}$/);
  });
  it('비밀번호·세션·업로드 키를 검사한다', () => {
    expect(verifyPassword('pw-secret')).toBe(true);
    expect(verifyPassword('pw-secret ')).toBe(false);
    expect(verifyPassword('')).toBe(false);
    expect(verifySession(sessionTokenFor('pw-secret'))).toBe(true);
    expect(verifySession(sessionTokenFor('other'))).toBe(false);
    expect(verifyIngestKey('k'.repeat(32))).toBe(true);
    expect(verifyIngestKey('k'.repeat(31))).toBe(false);
  });
  it('환경변수가 없거나 키가 짧으면 전부 거부한다', () => {
    process.env.CALLS_PASSWORD = '';
    process.env.CALLS_INGEST_KEY = 'short';
    expect(verifyPassword('')).toBe(false);
    expect(verifySession('')).toBe(false);
    expect(verifyIngestKey('short')).toBe(false);
  });
  it('비밀 주소 키: 40~64자 16진수만 인정하고, 해시로 저장 위치를 정한다', () => {
    const key = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718';
    expect(isSiteKey(key)).toBe(true);
    expect(isSiteKey(key.slice(0, 39))).toBe(false);
    expect(isSiteKey(key.toUpperCase())).toBe(false);
    expect(isSiteKey('k'.repeat(48))).toBe(false);
    expect(siteNamespace(key)).toMatch(/^[0-9a-f]{32}$/);
    expect(siteNamespace(key)).toBe(siteNamespace(key));
    expect(siteNamespace(key)).not.toBe(siteNamespace(key.replace(/0/g, '1')));
    // 환경변수 키면 기본 위치(undefined), 비밀 주소 키면 해시, 그 외는 거부(null)
    process.env.CALLS_INGEST_KEY = 'k'.repeat(32);
    expect(resolveIngestNamespace('k'.repeat(32))).toBeUndefined();
    expect(resolveIngestNamespace(key)).toBe(siteNamespace(key));
    expect(resolveIngestNamespace('nope')).toBeNull();
    expect(resolveIngestNamespace(null)).toBeNull();
  });
});

describe('calls store (파일 백엔드)', () => {
  let dir: string;
  const env = process.env;
  beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), 'calls-')); process.env = { ...env, CALLS_STORE_DIR: dir }; });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); process.env = env; });

  it('스냅샷을 저장하고 최신본·날짜별 이력을 읽는다. 같은 날은 덮어쓴다', async () => {
    expect(await loadLatest()).toBeNull();
    await saveSnapshot(snap());
    await saveSnapshot(snap({ generatedAt: '2026-09-29T12:30:00.000Z', stats: { A: stats({ filled: 12 }), B: stats() } }));
    const h = await saveSnapshot(snap({ generatedAt: '2026-09-29T13:00:00.000Z', stats: { A: stats({ filled: 13 }), B: stats() } }));
    expect(h.map((x) => `${x.day}:${x.filled}`)).toEqual(['2026-09-28:9', '2026-09-29:13']);
    expect((await loadLatest())?.stats.A.filled).toBe(13);
    expect((await loadHistory()).length).toBe(2);
  });
  it('kstDay 는 UTC 시각을 한국 날짜로 바꾼다(자정 넘김 포함)', () => {
    expect(kstDay('2026-09-28T04:48:00.000Z')).toBe('2026-09-28');
    expect(kstDay('2026-09-28T15:30:00.000Z')).toBe('2026-09-29');
  });
  it('비밀 주소 네임스페이스별로 따로 저장되고 기본 위치와 섞이지 않는다', async () => {
    const ns1 = siteNamespace('a'.repeat(48));
    const ns2 = siteNamespace('b'.repeat(48));
    await saveSnapshot(snap({ week: '2026-W40', generatedAt: '2026-09-28T04:00:00.000Z' }), ns1);
    await saveSnapshot(snap({ week: '2026-W41', generatedAt: '2026-10-05T04:00:00.000Z' }), ns1);
    await saveSnapshot(snap({ week: '2026-W39', generatedAt: '2026-09-21T04:00:00.000Z' }), ns2);
    expect(await loadLatest()).toBeNull();
    expect((await loadLatest(ns1))?.week).toBe('2026-W41');
    expect((await loadHistory(ns1)).map((h) => h.week)).toEqual(['2026-W40', '2026-W41']);
    expect((await loadHistory(ns2)).map((h) => h.week)).toEqual(['2026-W39']);
  });
  it('validateSnapshot 은 형식이 다르면 거부한다', () => {
    expect(validateSnapshot(snap())).toBe(true);
    expect(validateSnapshot({ ...snap(), version: 2 })).toBe(false);
    expect(validateSnapshot({ ...snap(), week: 'W40' })).toBe(false);
    expect(validateSnapshot('x')).toBe(false);
  });
  it('upsertHistory 는 날짜 순으로 정렬하고, day 가 없는 옛 기록은 주차로 유지한다', () => {
    const e = (day: string): HistoryEntry => ({ ...toHistoryEntry(snap({ generatedAt: `${day}T04:00:00.000Z` })) });
    expect(upsertHistory([e('2026-10-03'), e('2026-10-01')], e('2026-10-02')).map((x) => x.day)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
    const old: HistoryEntry = { ...toHistoryEntry(snap({ week: '2026-W39' })), day: undefined };
    expect(upsertHistory([old], e('2026-10-01')).map((x) => x.day ?? x.week)).toEqual(['2026-10-01', '2026-W39'].sort());
  });
});

describe('estimateWeeksToTarget', () => {
  it('최근 이력의 체결 증가 속도로 남은 주를 계산한다', () => {
    const h = (week: string, filled: number): HistoryEntry => ({ ...toHistoryEntry(snap({ week })), filled });
    expect(estimateWeeksToTarget(snap(), [h('2026-W38', 3), h('2026-W39', 6), h('2026-W40', 9)])).toBe(14); // (50-9)/3
    expect(estimateWeeksToTarget(snap({ stats: { A: stats({ filled: 50 }), B: stats() } }), [])).toBe(0);
  });
  it('이력이 없으면 첫 콜 이후 평균 속도를 쓴다', () => {
    const s = snap({ calls: [{ postedAt: Date.parse('2026-09-07T00:00:00Z') / 1000 } as Snapshot['calls'][number]] });
    expect(estimateWeeksToTarget(s, [])).toBe(14); // 3주 동안 9건 → 3/주 → 41/3
  });
});

// 성적표 저장소. 운영은 Vercel Blob(비공개 블롭), 로컬 개발·테스트는 CALLS_STORE_DIR 폴더.
// 콜 내용(유료 콘텐츠)이 담기므로 블롭은 항상 access: 'private' 로만 쓴다.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { HistoryEntry, Snapshot } from '@/types/calls';

const LATEST = 'call-verify/latest.json';
const HISTORY = 'call-verify/history.json';

export class StoreNotConfigured extends Error {
  constructor() {
    super('저장소가 연결되지 않았습니다. Vercel 프로젝트에 Blob 저장소를 연결하세요(BLOB_READ_WRITE_TOKEN).');
  }
}

interface Backend {
  read(key: string): Promise<string | null>;
  write(key: string, body: string): Promise<void>;
}

function fsBackend(dir: string): Backend {
  const file = (key: string) => path.join(dir, key.replace(/[^A-Za-z0-9_./-]/g, '_'));
  return {
    async read(key) {
      try {
        return await fs.readFile(file(key), 'utf8');
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw e;
      }
    },
    async write(key, body) {
      await fs.mkdir(path.dirname(file(key)), { recursive: true });
      await fs.writeFile(file(key), body, 'utf8');
    },
  };
}

function blobBackend(): Backend {
  return {
    async read(key) {
      const { get } = await import('@vercel/blob');
      const res = await get(key, { access: 'private', useCache: false });
      if (!res || res.statusCode !== 200 || !res.stream) return null;
      return new Response(res.stream).text();
    },
    async write(key, body) {
      const { put } = await import('@vercel/blob');
      await put(key, body, {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
        cacheControlMaxAge: 0,
      });
    },
  };
}

export function getBackend(): Backend {
  if (process.env.CALLS_STORE_DIR) return fsBackend(process.env.CALLS_STORE_DIR);
  if (process.env.BLOB_READ_WRITE_TOKEN) return blobBackend();
  throw new StoreNotConfigured();
}

export function isStoreConfigured(): boolean {
  return Boolean(process.env.CALLS_STORE_DIR || process.env.BLOB_READ_WRITE_TOKEN);
}

export async function loadLatest(): Promise<Snapshot | null> {
  const raw = await getBackend().read(LATEST);
  return raw ? (JSON.parse(raw) as Snapshot) : null;
}

export async function loadHistory(): Promise<HistoryEntry[]> {
  const raw = await getBackend().read(HISTORY);
  return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
}

export function toHistoryEntry(s: Snapshot): HistoryEntry {
  const a = s.stats.A;
  return {
    week: s.week,
    generatedAt: s.generatedAt,
    usable: s.counts.usable,
    filled: a.filled,
    winRate: a.winRate,
    meanR: a.meanR,
    t: a.t,
    pf: a.pf,
    mdd: a.mdd,
    verdict: a.verdict,
  };
}

// 같은 주차는 덮어쓴다(주간 배치를 두 번 돌려도 한 줄).
export function upsertHistory(history: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  const rest = history.filter((h) => h.week !== entry.week);
  return [...rest, entry].sort((x, y) => x.week.localeCompare(y.week)).slice(-260);
}

export async function saveSnapshot(s: Snapshot): Promise<HistoryEntry[]> {
  const be = getBackend();
  const history = upsertHistory(
    ((await be.read(HISTORY).then((r) => (r ? JSON.parse(r) : []))) as HistoryEntry[]),
    toHistoryEntry(s),
  );
  await be.write(LATEST, JSON.stringify(s));
  await be.write(HISTORY, JSON.stringify(history));
  return history;
}

// 최소한의 형태 검사. 계산은 PC에서 끝났으므로 여기서는 구조만 본다.
export function validateSnapshot(x: unknown): x is Snapshot {
  if (!x || typeof x !== 'object') return false;
  const s = x as Partial<Snapshot>;
  return (
    s.version === 1 &&
    typeof s.generatedAt === 'string' &&
    typeof s.week === 'string' &&
    /^\d{4}-W\d{2}$/.test(s.week) &&
    Array.isArray(s.calls) &&
    !!s.stats?.A &&
    typeof s.stats.A.verdict === 'string' &&
    !!s.equity?.A &&
    Array.isArray(s.equity.A)
  );
}

// /calls 접근 보호. 사용자는 대표 한 명이므로 비밀번호 하나(CALLS_PASSWORD)와
// PC 업로더용 키 하나(CALLS_INGEST_KEY)만 쓴다. 둘 다 Vercel 환경변수에만 둔다.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'calls_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30일

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

// 비밀번호에서 파생한 세션 토큰. 비밀번호를 바꾸면 기존 세션이 전부 무효가 된다.
export function sessionTokenFor(password: string): string {
  const key = createHash('sha256').update(`calls-session-v1|${password}`).digest();
  return createHmac('sha256', key).update('ok').digest('hex');
}

export function isConfigured(): boolean {
  return Boolean(process.env.CALLS_PASSWORD && process.env.CALLS_INGEST_KEY);
}

export function verifyPassword(input: string | null | undefined): boolean {
  const pw = process.env.CALLS_PASSWORD;
  if (!pw || !input) return false;
  return safeEqual(input, pw);
}

export function verifySession(cookieValue: string | null | undefined): boolean {
  const pw = process.env.CALLS_PASSWORD;
  if (!pw || !cookieValue) return false;
  return safeEqual(cookieValue, sessionTokenFor(pw));
}

export function verifyIngestKey(header: string | null | undefined): boolean {
  const key = process.env.CALLS_INGEST_KEY;
  if (!key || key.length < 16 || !header) return false;
  return safeEqual(header, key);
}

// ── 비밀 주소 방식(환경변수 없이 쓰는 기본 방식) ──
// PC의 setup_site.bat 이 만든 48자 16진수 키 하나가 업로드 키이자 보기 주소(/calls/<키>)다.
// 서버는 키를 저장하지 않고, 키의 해시로 저장 위치(네임스페이스)만 정한다. 키를 아는 사람만 올리고 볼 수 있다.
export function isSiteKey(key: string | null | undefined): key is string {
  return typeof key === 'string' && /^[0-9a-f]{40,64}$/.test(key);
}

export function siteNamespace(key: string): string {
  return createHash('sha256').update(`calls-site-v1|${key}`).digest('hex').slice(0, 32);
}

// 요청 헤더의 키 → 저장 네임스페이스. 환경변수 키(옛 방식)면 기본 위치(undefined), 비밀 주소 키면 그 해시, 아니면 null(거부).
export function resolveIngestNamespace(header: string | null | undefined): string | undefined | null {
  if (verifyIngestKey(header)) return undefined;
  if (isSiteKey(header)) return siteNamespace(header);
  return null;
}

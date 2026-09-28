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

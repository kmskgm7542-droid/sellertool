'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, SESSION_MAX_AGE, sessionTokenFor, verifyPassword } from '@/lib/calls/auth';

export async function login(formData: FormData): Promise<void> {
  const input = String(formData.get('password') ?? '');
  if (!verifyPassword(input)) {
    // 무차별 대입을 늦춘다(사용자는 한 명).
    await new Promise((r) => setTimeout(r, 800));
    redirect('/calls?error=1');
  }
  const store = await cookies();
  store.set(SESSION_COOKIE, sessionTokenFor(process.env.CALLS_PASSWORD!), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/calls',
    maxAge: SESSION_MAX_AGE,
  });
  redirect('/calls');
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, '', { path: '/calls', maxAge: 0 });
  redirect('/calls');
}

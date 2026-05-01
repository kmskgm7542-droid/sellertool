'use client';

import { useSession, signIn, signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function Header() {
  const { data: session } = useSession();

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-blue-600">
          셀러툴
        </Link>
        <div className="flex items-center gap-3">
          {session ? (
            <>
              <span className="text-sm text-slate-600">
                {session.user?.name ?? '회원'}님
              </span>
              <Link href="/dashboard">
                <Button variant="outline" size="sm">내 리포트</Button>
              </Link>
              <Button variant="ghost" size="sm" onClick={() => signOut()}>
                로그아웃
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              className="bg-[#FEE500] text-[#3C1E1E] hover:bg-[#F0D800]"
              onClick={() => signIn('kakao')}
            >
              카카오 로그인
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

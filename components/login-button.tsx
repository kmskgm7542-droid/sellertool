'use client';

import { useSession, signIn, signOut } from 'next-auth/react';

function KakaoIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M9 1.5C4.86 1.5 1.5 4.19 1.5 7.5c0 2.09 1.25 3.93 3.14 5.04l-.8 2.96c-.07.26.22.46.44.32L7.7 13.5c.42.06.86.09 1.3.09 4.14 0 7.5-2.69 7.5-6S13.14 1.5 9 1.5z"
        fill="#000000"
      />
    </svg>
  );
}

export default function LoginButton() {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return (
      <div className="h-8 w-28 rounded-md bg-slate-100 animate-pulse" />
    );
  }

  if (session?.user) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-600 hidden sm:inline">
          {session.user.name ?? session.user.email}
        </span>
        <button
          onClick={() => signOut({ callbackUrl: '/' })}
          className="text-sm px-3 py-1.5 rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors"
        >
          로그아웃
        </button>
      </div>
    );
  }

  // 카카오 앱 키가 없는 경우(환경변수 미설정) 버튼은 렌더링하되 클릭 시 안내
  const kakaoReady = !!(
    typeof window !== 'undefined' &&
    process.env.NEXT_PUBLIC_KAKAO_READY !== 'false'
  );

  const handleLogin = () => {
    signIn('kakao', { callbackUrl: '/' });
  };

  return (
    <button
      onClick={handleLogin}
      className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-opacity hover:opacity-90 active:scale-95"
      style={{ backgroundColor: '#FEE500', color: '#000000' }}
    >
      <KakaoIcon />
      <span>카카오로 로그인</span>
    </button>
  );
}

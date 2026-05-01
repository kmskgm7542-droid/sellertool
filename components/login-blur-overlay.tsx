'use client';

import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';

interface LoginBlurOverlayProps {
  children: React.ReactNode;
  isLoggedIn: boolean;
  label?: string;
}

export default function LoginBlurOverlay({ children, isLoggedIn, label }: LoginBlurOverlayProps) {
  if (isLoggedIn) return <>{children}</>;

  return (
    <div className="relative">
      <div className="blur-sm pointer-events-none select-none">{children}</div>
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/60 backdrop-blur-[2px] rounded-xl">
        <p className="text-sm text-slate-600 mb-3">
          {label ?? '전체 내용은 로그인 후 확인하세요'}
        </p>
        <Button
          className="bg-[#FEE500] text-[#3C1E1E] hover:bg-[#F0D800]"
          onClick={() => signIn('kakao')}
        >
          카카오 로그인으로 전체 보기
        </Button>
      </div>
    </div>
  );
}

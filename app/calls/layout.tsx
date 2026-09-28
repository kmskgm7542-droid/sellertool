import type { Metadata } from 'next';

// 본인 검증용 비공개 페이지. 검색엔진 색인 금지, 미리보기 카드 없음.
export const metadata: Metadata = {
  title: '콜 검증 성적표',
  description: '',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  openGraph: undefined,
};

export default function CallsLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-full bg-background text-foreground">{children}</div>;
}

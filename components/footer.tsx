import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="mt-auto bg-white border-t border-slate-200">
      <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
        <span className="text-xs text-slate-400">
          셀러툴 — 데이터 기반 소싱 판단 · 네이버 공식 API 기반
        </span>
        <nav className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          <Link href="/" className="hover:text-blue-600">
            키워드 분석
          </Link>
          <Link href="/fees/smartstore" className="hover:text-blue-600">
            스마트스토어 수수료 계산
          </Link>
          <Link href="/fees/coupang" className="hover:text-blue-600">
            쿠팡 수수료 계산
          </Link>
        </nav>
      </div>
    </footer>
  );
}

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

export default function Header() {
  return (
    <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-xs font-black">S</span>
          </div>
          <span className="text-lg font-bold text-slate-900">셀러툴</span>
        </Link>
        <Badge variant="secondary" className="bg-blue-50 text-blue-700 border border-blue-200 hidden sm:flex">
          무료 · 로그인 불필요
        </Badge>
      </div>
    </header>
  );
}

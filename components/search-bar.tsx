'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Camera, X, Clock } from 'lucide-react';
import Image from 'next/image';

interface SearchBarProps {
  onSearch: (keyword: string) => void;
  loading?: boolean;
  compact?: boolean;
}

const EXAMPLE_KEYWORDS = ['무선이어폰', '요가매트', '텀블러', '에어팟케이스', '캠핑의자'];
const HISTORY_KEY = 'seller-tool-history';
const MAX_HISTORY = 8;

export default function SearchBar({ onSearch, loading, compact = false }: SearchBarProps) {
  const [keyword, setKeyword] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(HISTORY_KEY);
      if (stored) setHistory(JSON.parse(stored));
    } catch {}
  }, []);

  const addToHistory = (kw: string) => {
    const updated = [kw, ...history.filter((h) => h !== kw)].slice(0, MAX_HISTORY);
    setHistory(updated);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(updated)); } catch {}
  };

  const removeFromHistory = (kw: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = history.filter((h) => h !== kw);
    setHistory(updated);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(updated)); } catch {}
  };

  const clearHistory = () => {
    setHistory([]);
    try { localStorage.removeItem(HISTORY_KEY); } catch {}
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (keyword.trim()) {
      addToHistory(keyword.trim());
      onSearch(keyword.trim());
    }
  };

  const handleExample = (kw: string) => {
    setKeyword(kw);
    addToHistory(kw);
    onSearch(kw);
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);
    setImageLoading(true);

    try {
      const formData = new FormData();
      formData.append('image', file);

      const res = await fetch('/api/image-analyze', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error('분석 실패');

      const data = await res.json();
      if (data.keyword) {
        setKeyword(data.keyword);
        addToHistory(data.keyword);
        onSearch(data.keyword);
      }
    } catch {
      // 이미지 분석 실패 시 수동 입력 유도
    } finally {
      setImageLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const clearImage = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="w-full">
      {imagePreview && !compact && (
        <div className="mb-3 flex items-center gap-3 bg-white/10 border border-white/20 rounded-xl px-3 py-2">
          <div className="relative w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">
            <Image
              src={imagePreview}
              alt="업로드 이미지"
              fill
              className="object-cover"
            />
          </div>
          <div className="flex-1 min-w-0">
            {imageLoading ? (
              <span className="text-xs text-white/70 flex items-center gap-1.5">
                <svg className="animate-spin w-3 h-3 text-blue-400" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                이미지 분석 중...
              </span>
            ) : (
              <span className="text-xs text-white/70">이미지 분석 완료</span>
            )}
          </div>
          <button
            type="button"
            onClick={clearImage}
            className="text-white/50 hover:text-white/90 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="w-full flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="소싱할 키워드를 입력하세요 (예: 무선이어폰)"
            className={`pl-10 bg-white border-slate-300 focus:border-blue-500 focus:ring-blue-500 ${compact ? 'h-10 text-sm' : 'h-12 text-base'}`}
            disabled={loading || imageLoading}
          />
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageSelect}
          disabled={loading || imageLoading}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading || imageLoading}
          title="사진으로 검색"
          className={`border-slate-300 bg-white hover:bg-slate-50 text-slate-600 flex-shrink-0 px-3 ${compact ? 'h-10' : 'h-12'}`}
        >
          <Camera className="w-4 h-4" />
        </Button>

        <Button
          type="submit"
          disabled={loading || imageLoading || !keyword.trim()}
          className={`bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 flex-shrink-0 ${compact ? 'h-10' : 'h-12'}`}
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              분석 중
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <Search className="w-4 h-4" />
              분석하기
            </span>
          )}
        </Button>
      </form>

      {!compact && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-400">예시:</span>
            {EXAMPLE_KEYWORDS.map((kw) => (
              <button
                key={kw}
                type="button"
                onClick={() => handleExample(kw)}
                disabled={loading || imageLoading}
                className="text-xs px-3 py-1 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors border border-blue-200 disabled:opacity-50"
              >
                {kw}
              </button>
            ))}
            <span className="text-xs text-slate-400 ml-1">또는</span>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading || imageLoading}
              className="text-xs px-3 py-1 rounded-full bg-slate-50 text-slate-500 hover:bg-slate-100 transition-colors border border-slate-200 disabled:opacity-50 flex items-center gap-1"
            >
              <Camera className="w-3 h-3" />
              사진으로 검색
            </button>
          </div>

          {history.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                최근:
              </span>
              {history.map((kw) => (
                <button
                  key={kw}
                  type="button"
                  onClick={() => handleExample(kw)}
                  disabled={loading || imageLoading}
                  className="text-xs px-2.5 py-1 rounded-full bg-white text-slate-500 hover:bg-slate-50 transition-colors border border-slate-200 disabled:opacity-50 flex items-center gap-1 group"
                >
                  {kw}
                  <span
                    role="button"
                    onClick={(e) => removeFromHistory(kw, e)}
                    className="text-slate-300 hover:text-slate-500 leading-none"
                  >
                    <X className="w-2.5 h-2.5" />
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={clearHistory}
                className="text-xs text-slate-300 hover:text-slate-500 transition-colors"
              >
                전체 삭제
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

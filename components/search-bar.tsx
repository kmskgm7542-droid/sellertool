'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

interface SearchBarProps {
  onSearch: (keyword: string) => void;
  loading?: boolean;
}

export default function SearchBar({ onSearch, loading }: SearchBarProps) {
  const [keyword, setKeyword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (keyword.trim()) onSearch(keyword.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="w-full flex gap-2">
      <Input
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder="소싱할 키워드를 입력하세요 (예: 무선이어폰, 요가매트)"
        className="flex-1 h-12 text-base"
        disabled={loading}
      />
      <Button type="submit" size="lg" disabled={loading || !keyword.trim()}>
        {loading ? (
          <span className="animate-spin">&#x27F3;</span>
        ) : (
          <><Search className="w-4 h-4 mr-2" />분석</>
        )}
      </Button>
    </form>
  );
}

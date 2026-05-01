'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import Header from '@/components/header';
import SearchBar from '@/components/search-bar';
import CompetitionCard from '@/components/competition-card';
import MarketSizeCard from '@/components/market-size-card';
import CostCalculator from '@/components/cost-calculator';
import EntryVerdict from '@/components/entry-verdict';
import SourcingReport from '@/components/sourcing-report';
import type { MarketAnalysis } from '@/types';

export default function HomePage() {
  const { data: session } = useSession();
  const isLoggedIn = !!session;
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<MarketAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (keyword: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analyze?keyword=${encodeURIComponent(keyword)}`);
      if (!res.ok) throw new Error('분석 실패');
      const data: MarketAnalysis = await res.json();
      setAnalysis(data);
    } catch {
      setError('분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="max-w-6xl mx-auto px-4 py-8">
        {!analysis && (
          <div className="text-center mb-8">
            <h1 className="text-3xl font-black text-slate-900 mb-2">
              이커머스 시장조사 무료 툴
            </h1>
            <p className="text-slate-500">
              키워드 하나로 경쟁 분석 · 시장 규모 · 원가율 · 진입 판정까지
            </p>
          </div>
        )}

        <SearchBar onSearch={handleSearch} loading={loading} />

        {error && (
          <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-xl text-sm">{error}</div>
        )}

        {analysis && (
          <div className="mt-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <CompetitionCard data={analysis.competition} isLoggedIn={isLoggedIn} />
              <MarketSizeCard data={analysis.marketSize} isLoggedIn={isLoggedIn} />
              <CostCalculator />
              <EntryVerdict data={analysis.verdict} isLoggedIn={isLoggedIn} />
            </div>
            <SourcingReport data={analysis} isLoggedIn={isLoggedIn} />
          </div>
        )}
      </main>
    </div>
  );
}

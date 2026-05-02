'use client';

import { useState } from 'react';
import Header from '@/components/header';
import SearchBar from '@/components/search-bar';
import CompetitionCard from '@/components/competition-card';
import MarketSizeCard from '@/components/market-size-card';
import CostCalculator from '@/components/cost-calculator';
import EntryVerdict from '@/components/entry-verdict';
import SourcingReport from '@/components/sourcing-report';
import ShippingCalculator from '@/components/shipping-calculator';
import type { MarketAnalysis } from '@/types';
import { BarChart2, TrendingUp, ShieldCheck } from 'lucide-react';

const FEATURES = [
  {
    icon: BarChart2,
    title: '경쟁 분석',
    desc: '상품 수·가격대·리뷰·광고밀도를 한눈에',
  },
  {
    icon: TrendingUp,
    title: '시장 규모',
    desc: '월 검색량·거래액·트렌드를 즉시 확인',
  },
  {
    icon: ShieldCheck,
    title: '진입 판정',
    desc: 'GO / HOLD / NO-GO 판정을 5초 만에',
  },
];

export default function HomePage() {
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

      {!analysis ? (
        <>
          {/* 히어로 섹션 */}
          <section className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 py-12 sm:py-20 px-4">
            <div className="max-w-3xl mx-auto text-center">
              {/* 배지 */}
              <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 mb-5">
                <span className="text-sm">🚀</span>
                <span className="text-white/90 text-sm font-medium">셀러 3,000명이 쓰는 소싱툴</span>
              </div>

              {/* 헤드라인 */}
              <h1 className="text-3xl sm:text-5xl font-black text-white leading-tight mb-4">
                이커머스 소싱,<br />
                <span className="text-blue-400">키워드 하나</span>로 끝내세요
              </h1>
              <p className="text-slate-300 text-sm sm:text-lg mb-8 max-w-xl mx-auto">
                경쟁 분석 · 시장 규모 · 원가율 · 진입 판정을{' '}
                <strong className="text-white">5초 만에</strong>
              </p>

              {/* 검색바 */}
              <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-3 sm:p-5">
                <SearchBar onSearch={handleSearch} loading={loading} />
              </div>
            </div>

            {/* 기능 3개 */}
            <div className="max-w-3xl mx-auto mt-8 sm:mt-12 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {FEATURES.map(({ icon: Icon, title, desc }) => (
                <div
                  key={title}
                  className="flex items-start gap-3 bg-white/5 border border-white/10 rounded-xl p-3 sm:p-4"
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Icon className="w-4 h-4 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-white font-semibold text-sm">{title}</p>
                    <p className="text-slate-400 text-xs mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {error && (
            <div className="max-w-3xl mx-auto px-4 mt-6">
              <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
                {error}
              </div>
            </div>
          )}
        </>
      ) : (
        /* 결과 섹션 */
        <main className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
          {/* 컴팩트 헤더 */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-base sm:text-lg font-bold text-slate-900 truncate">
                &ldquo;{analysis.keyword}&rdquo;
              </span>
              <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 text-xs font-medium px-2.5 py-1 rounded-full border border-green-200 flex-shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                분석 완료
              </span>
            </div>
            <div className="w-full sm:max-w-sm">
              <SearchBar onSearch={handleSearch} loading={loading} compact />
            </div>
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
              {error}
            </div>
          )}

          <div className="space-y-3 sm:space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <CompetitionCard data={analysis.competition} />
              <MarketSizeCard data={analysis.marketSize} />
              <CostCalculator />
              <EntryVerdict data={analysis.verdict} />
              <ShippingCalculator />
            </div>
            <SourcingReport data={analysis} />
          </div>
        </main>
      )}
    </div>
  );
}

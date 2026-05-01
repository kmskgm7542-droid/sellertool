import { NextRequest, NextResponse } from 'next/server';
import { searchNaverShopping, getNaverShoppingTrend } from '@/lib/naver';
import {
  calcCompetition,
  calcCompetitionScore,
  calcCostScore,
  calcGrowthScore,
  calcVerdict,
  parseTrendData,
} from '@/lib/analysis';
import type { NaverShoppingItem, MarketAnalysis } from '@/types';

function getMockData(keyword: string): MarketAnalysis {
  const competition = {
    totalProducts: 1842,
    minPrice: 12900,
    avgPrice: 38400,
    maxPrice: 189000,
    avgReviews: 342,
    adDensity: 0.32,
    items: [],
  };
  const marketSize = {
    monthlySearchVolume: 45200,
    estimatedMonthlyRevenue: 26050560,
    trend: 'rising' as const,
    trendData: [
      { period: '2025-02', ratio: 72 },
      { period: '2025-03', ratio: 85 },
      { period: '2025-04', ratio: 100 },
    ],
  };
  const competitionScore = 28;
  const costScore = 15;
  const growthScore = 25;
  return {
    keyword,
    competition,
    marketSize,
    costRatio: null,
    verdict: calcVerdict(competitionScore, costScore, growthScore),
    createdAt: new Date().toISOString(),
  };
}

export async function GET(req: NextRequest) {
  const keyword = req.nextUrl.searchParams.get('keyword');
  if (!keyword) {
    return NextResponse.json({ error: '키워드 필요' }, { status: 400 });
  }

  const clientId = process.env.NAVER_CLIENT_ID;
  const isMock = !clientId || clientId === '여기에_입력';

  if (isMock) {
    return NextResponse.json(getMockData(keyword));
  }

  try {
    const [searchData, trendData] = await Promise.all([
      searchNaverShopping(keyword),
      getNaverShoppingTrend(keyword).catch(() => null),
    ]);

    const items: NaverShoppingItem[] = (searchData.items ?? []).map((item) => ({
      ...item,
      reviewCount: 0,
    }));

    const competition = calcCompetition(items, searchData.total ?? 0);
    const { trendData: trendPoints, trend, monthlySearchVolume } = parseTrendData(trendData);

    const marketSize = {
      monthlySearchVolume,
      estimatedMonthlyRevenue: Math.round(monthlySearchVolume * 0.015 * competition.avgPrice),
      trend,
      trendData: trendPoints,
    };

    const competitionScore = calcCompetitionScore(competition);
    const growthScore = calcGrowthScore(trend);
    const costScore = calcCostScore(null);
    const verdict = calcVerdict(competitionScore, costScore, growthScore);

    return NextResponse.json({
      keyword,
      competition,
      marketSize,
      costRatio: null,
      verdict,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Analyze error:', error);
    return NextResponse.json({ error: '분석 실패' }, { status: 500 });
  }
}

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
import type { NaverShoppingItem } from '@/types';

export async function GET(req: NextRequest) {
  const keyword = req.nextUrl.searchParams.get('keyword');
  if (!keyword) {
    return NextResponse.json({ error: '키워드 필요' }, { status: 400 });
  }

  try {
    const [searchData, trendData] = await Promise.all([
      searchNaverShopping(keyword),
      getNaverShoppingTrend(keyword).catch(() => null),
    ]);

    // Naver API 응답에 reviewCount 필드가 없으므로 기본값 0으로 보강
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

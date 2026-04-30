import type {
  NaverShoppingItem,
  CompetitionData,
  CostCalculatorInput,
  CostRatioData,
  VerdictData,
  MarketSizeData,
  TrendPoint,
} from '@/types';

export function calcCompetition(
  items: NaverShoppingItem[],
  totalProducts: number
): CompetitionData {
  const lprices = items.map((i) => Number(i.lprice)).filter((p) => p > 0);
  const hprices = items.map((i) => Number(i.hprice)).filter((p) => p > 0);
  const allPrices = [...lprices, ...hprices].sort((a, b) => a - b);

  const minPrice = lprices.length > 0 ? Math.min(...lprices) : 0;
  const maxPrice = hprices.length > 0
    ? [...hprices].sort((a, b) => a - b)[Math.floor(hprices.length / 2)]
    : 0;
  const avgPrice = lprices.length > 0
    ? Math.round(lprices.reduce((a, b) => a + b, 0) / lprices.length)
    : 0;
  const avgReviews = items.length > 0
    ? Math.floor(items.reduce((a, b) => a + (b.reviewCount || 0), 0) / items.length)
    : 0;
  const adDensity = items.length > 0 ? Math.min(items.length / totalProducts, 1) : 0;

  void allPrices; // 미래 분포 계산용 예약

  return { totalProducts, minPrice, avgPrice, maxPrice, avgReviews, adDensity, items };
}

export function calcCostRatio(input: CostCalculatorInput): CostRatioData {
  const {
    costCNY,
    sellPriceKRW,
    platform,
    exchangeRate = 190,
    shippingCostKRW = 3000,
    customsDutyRate = 0.08,
    inspectionFeeKRW = 500,
  } = input;

  const baseCostKRW = costCNY * exchangeRate;
  const customsKRW = Math.round(baseCostKRW * customsDutyRate);
  const costKRW = baseCostKRW + shippingCostKRW + customsKRW + inspectionFeeKRW;

  const feeRate = platform === 'smartstore' ? 0.0318 : 0.07;
  const platformFeeKRW = Math.round(sellPriceKRW * feeRate);
  const marginKRW = sellPriceKRW - costKRW - platformFeeKRW;
  const marginRate = Math.round((marginKRW / sellPriceKRW) * 10000) / 100;
  const costRatio = Math.round((costKRW / sellPriceKRW) * 10000) / 100;

  const grade: CostRatioData['grade'] =
    costRatio <= 20 ? 'excellent' : costRatio <= 30 ? 'pass' : 'fail';

  return { costKRW, platformFeeKRW, marginKRW, marginRate, costRatio, grade };
}

export function calcVerdict(
  competitionScore: number,
  costScore: number,
  growthScore: number
): VerdictData {
  const totalScore = competitionScore + costScore + growthScore;
  const verdict: VerdictData['verdict'] =
    totalScore >= 70 ? 'go' : totalScore >= 40 ? 'hold' : 'no-go';

  const reasons: string[] = [];
  if (competitionScore < 15) reasons.push('경쟁 강도 높음');
  if (costScore < 15) reasons.push('원가율 기준 미달');
  if (growthScore < 15) reasons.push('시장 성장성 낮음');

  return { totalScore, competitionScore, costScore, growthScore, verdict, reasons };
}

export function calcCompetitionScore(competition: CompetitionData): number {
  let score = 40;
  if (competition.totalProducts > 10000) score -= 15;
  else if (competition.totalProducts > 5000) score -= 10;
  else if (competition.totalProducts > 1000) score -= 5;

  if (competition.avgReviews > 500) score -= 10;
  else if (competition.avgReviews > 100) score -= 5;

  if (competition.adDensity > 0.5) score -= 10;
  else if (competition.adDensity > 0.3) score -= 5;

  return Math.max(0, score);
}

export function calcCostScore(costRatio: number | null): number {
  if (costRatio === null) return 15;
  if (costRatio <= 20) return 30;
  if (costRatio <= 25) return 22;
  if (costRatio <= 30) return 15;
  return 0;
}

export function calcGrowthScore(trend: MarketSizeData['trend']): number {
  if (trend === 'rising') return 30;
  if (trend === 'stable') return 18;
  return 5;
}

export function calcMarketSize(
  monthlySearchVolume: number,
  avgPrice: number,
  trendData: TrendPoint[],
  trend: MarketSizeData['trend']
): MarketSizeData {
  const conversionRate = 0.015;
  const estimatedMonthlyRevenue = Math.round(monthlySearchVolume * conversionRate * avgPrice);

  return {
    monthlySearchVolume,
    estimatedMonthlyRevenue,
    trend,
    trendData,
  };
}

export function parseTrendData(datalabResponse: unknown): {
  trendData: TrendPoint[];
  trend: MarketSizeData['trend'];
  monthlySearchVolume: number;
} {
  const results = Array.isArray((datalabResponse as { results?: unknown[] })?.results)
    ? (datalabResponse as { results: Array<{ data: Array<{ period: string; ratio: number }> }> }).results
    : [];
  const data = results[0]?.data ?? [];
  const trendData: TrendPoint[] = data.map((d) => ({
    period: d.period,
    ratio: d.ratio,
  }));

  const latestRatio = trendData[trendData.length - 1]?.ratio ?? 50;
  const earliestRatio = trendData[0]?.ratio ?? 50;
  const diff = latestRatio - earliestRatio;

  const trend: MarketSizeData['trend'] =
    diff > 5 ? 'rising' : diff < -5 ? 'falling' : 'stable';

  const monthlySearchVolume = Math.round(latestRatio * 1000);

  return { trendData, trend, monthlySearchVolume };
}

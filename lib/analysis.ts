import type {
  NaverShoppingItem,
  CompetitionData,
  CostCalculatorInput,
  CostRatioData,
  FxScenarioRow,
  Platform,
  VerdictData,
  MarketSizeData,
  TrendPoint,
} from '@/types';

// 2026 수수료 개편 반영 (EXEC_REVIEW_2026-07 §1-4)
// - 네이버: 전 거래 판매수수료 — 스마트스토어 2.73% / 브랜드스토어 3.64%
// - 쿠팡: 최종결제금액 기준 카테고리별 4~10.9% — 소싱 판단은 보수 원칙(마진 과대평가
//   방지)으로 상한 10.9%를 기본값으로 쓰고, 카테고리 확정 시 feeRateOverride로 조정
export const PLATFORM_FEE_RATES: Record<Platform, number> = {
  smartstore: 0.0273,
  brandstore: 0.0364,
  coupang: 0.109,
};

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

  const feeRate = input.feeRateOverride ?? PLATFORM_FEE_RATES[platform];
  const platformFeeKRW = Math.round(sellPriceKRW * feeRate);
  const marginKRW = sellPriceKRW - costKRW - platformFeeKRW;
  const marginRate = Math.round((marginKRW / sellPriceKRW) * 10000) / 100;
  const costRatio = Math.round((costKRW / sellPriceKRW) * 10000) / 100;

  const grade: CostRatioData['grade'] =
    costRatio <= 20 ? 'excellent' : costRatio <= 30 ? 'pass' : 'fail';

  return { costKRW, platformFeeKRW, marginKRW, marginRate, costRatio, grade };
}

/**
 * 환율 시나리오 가드레일 (EXEC_REVIEW_2026-07 §1-3 "마진 가드레일" 일반화).
 *
 * 환율이 움직여도 목표 마진율(기본 20%)을 지키는지 시나리오별로 점검한다.
 * rates 미지정 시 기준 환율 −5% / 기준 / +5% 3구간. 원가는 외화 결제이므로
 * 환율 상승 = 원가 상승 = 마진 하락 — 최악 구간(ok=false)이 있으면 GO 판단을
 * 보류하라는 신호다. (일본 역직구 모듈에서는 rates에 850/900/950을 전달)
 */
export function calcFxScenarios(
  input: CostCalculatorInput,
  rates?: number[],
  minMarginRate = 20
): FxScenarioRow[] {
  const base = input.exchangeRate ?? 190;
  const scenarioRates =
    rates && rates.length > 0
      ? rates
      : [base * 0.95, base, base * 1.05].map((r) => Math.round(r * 100) / 100);

  return scenarioRates.map((rate) => {
    const r = calcCostRatio({ ...input, exchangeRate: rate });
    return {
      exchangeRate: rate,
      marginKRW: r.marginKRW,
      marginRate: r.marginRate,
      ok: r.marginRate >= minMarginRate,
    };
  });
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

export interface NaverShoppingItem {
  title: string;
  link: string;
  image: string;
  lprice: string;
  hprice: string;
  mallName: string;
  productId: string;
  reviewCount: number;
  category1: string;
}

export interface CompetitionData {
  totalProducts: number;
  minPrice: number;
  avgPrice: number;
  maxPrice: number;
  avgReviews: number;
  adDensity: number;
  items: NaverShoppingItem[];
}

export interface TrendPoint {
  period: string;
  ratio: number;
}

export interface MarketSizeData {
  monthlySearchVolume: number;
  estimatedMonthlyRevenue: number;
  trend: 'rising' | 'stable' | 'falling';
  trendData: TrendPoint[];
}

export type Platform = 'smartstore' | 'brandstore' | 'coupang';

export interface CostCalculatorInput {
  costCNY: number;
  sellPriceKRW: number;
  platform: Platform;
  exchangeRate?: number;
  shippingCostKRW?: number;
  customsDutyRate?: number;
  inspectionFeeKRW?: number;
  /** 플랫폼 기본 수수료율 대신 직접 지정 (예: 쿠팡 카테고리별 4~10.9%) */
  feeRateOverride?: number;
}

/** 환율 시나리오 1행 — 환율 변동 시 마진 가드레일 점검용 */
export interface FxScenarioRow {
  exchangeRate: number;
  marginKRW: number;
  marginRate: number;
  /** 해당 환율에서도 목표 마진율을 지키는지 */
  ok: boolean;
}

export interface CostRatioData {
  costKRW: number;
  platformFeeKRW: number;
  marginKRW: number;
  marginRate: number;
  costRatio: number;
  grade: 'excellent' | 'pass' | 'fail';
}

export interface VerdictData {
  totalScore: number;
  competitionScore: number;
  costScore: number;
  growthScore: number;
  verdict: 'go' | 'hold' | 'no-go';
  reasons: string[];
}

export interface MarketAnalysis {
  keyword: string;
  competition: CompetitionData;
  marketSize: MarketSizeData;
  costRatio: CostRatioData | null;
  verdict: VerdictData;
  createdAt: string;
}

export interface SavedReport {
  id: string;
  user_id: string;
  keyword: string;
  report_data: MarketAnalysis;
  created_at: string;
}

export interface SearchHistory {
  id: string;
  user_id: string;
  keyword: string;
  result_summary: {
    verdict: 'go' | 'hold' | 'no-go';
    totalScore: number;
  };
  searched_at: string;
}

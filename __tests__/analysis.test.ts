import {
  calcCompetition,
  calcCostRatio,
  calcVerdict,
  calcMarketSize,
} from '@/lib/analysis';
import type { NaverShoppingItem, CostCalculatorInput } from '@/types';

const mockItems: NaverShoppingItem[] = [
  { title: '상품A', link: '', image: '', lprice: '10000', hprice: '15000', mallName: '샵', productId: '1', reviewCount: 100, category1: '패션' },
  { title: '상품B', link: '', image: '', lprice: '12000', hprice: '18000', mallName: '샵', productId: '2', reviewCount: 200, category1: '패션' },
  { title: '상품C', link: '', image: '', lprice: '8000', hprice: '12000', mallName: '샵', productId: '3', reviewCount: 50, category1: '패션' },
];

describe('calcCompetition', () => {
  it('가격 최저/평균/최고를 정확히 계산한다', () => {
    const result = calcCompetition(mockItems, 300);
    expect(result.minPrice).toBe(8000);
    expect(result.avgPrice).toBe(10000);
    expect(result.maxPrice).toBe(15000);
    expect(result.totalProducts).toBe(300);
    expect(result.avgReviews).toBe(116);
  });
});

describe('calcCostRatio', () => {
  const input: CostCalculatorInput = {
    costCNY: 10,
    sellPriceKRW: 20000,
    platform: 'smartstore',
    exchangeRate: 190,
    shippingCostKRW: 3000,
    customsDutyRate: 0.08,
    inspectionFeeKRW: 500,
  };

  it('원가율을 정확히 계산한다', () => {
    const result = calcCostRatio(input);
    // costKRW = (10 * 190) + 3000 + (10*190*0.08) + 500 = 1900 + 3000 + 152 + 500 = 5552
    expect(result.costKRW).toBe(5552);
    expect(result.costRatio).toBeCloseTo(27.76, 1);
    expect(result.grade).toBe('pass');
  });

  it('원가율 20% 이하면 excellent', () => {
    const cheapInput: CostCalculatorInput = { ...input, costCNY: 5, shippingCostKRW: 0, inspectionFeeKRW: 0 };
    const result = calcCostRatio(cheapInput);
    expect(result.grade).toBe('excellent');
  });

  it('원가율 30% 초과면 fail', () => {
    const expensiveInput: CostCalculatorInput = { ...input, costCNY: 30 };
    const result = calcCostRatio(expensiveInput);
    expect(result.grade).toBe('fail');
  });
});

describe('calcVerdict', () => {
  it('점수 70 이상이면 go', () => {
    const result = calcVerdict(30, 25, 25);
    expect(result.verdict).toBe('go');
    expect(result.totalScore).toBe(80);
  });

  it('점수 40~69면 hold', () => {
    const result = calcVerdict(20, 15, 15);
    expect(result.verdict).toBe('hold');
  });

  it('점수 40 미만이면 no-go', () => {
    const result = calcVerdict(10, 5, 10);
    expect(result.verdict).toBe('no-go');
  });
});

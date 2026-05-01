'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Truck } from 'lucide-react';

type Carrier = 'cj' | 'logen' | 'hanjin';
type Region = 'normal' | 'remote';

const CARRIERS: { id: Carrier; name: string }[] = [
  { id: 'cj', name: 'CJ대한통운' },
  { id: 'logen', name: '로젠택배' },
  { id: 'hanjin', name: '한진택배' },
];

// 2024 기준 택배사별 요금표 (원)
const FEE_TABLE: Record<Carrier, Record<Region, Record<string, number>>> = {
  cj: {
    normal: { '2kg': 3000, '5kg': 3500, '10kg': 4500, '20kg': 6000, '30kg': 8000 },
    remote: { '2kg': 6000, '5kg': 7000, '10kg': 8000, '20kg': 10000, '30kg': 13000 },
  },
  logen: {
    normal: { '2kg': 2800, '5kg': 3300, '10kg': 4300, '20kg': 5800, '30kg': 7500 },
    remote: { '2kg': 5800, '5kg': 6800, '10kg': 7800, '20kg': 9800, '30kg': 12500 },
  },
  hanjin: {
    normal: { '2kg': 3000, '5kg': 3500, '10kg': 4500, '20kg': 6000, '30kg': 8000 },
    remote: { '2kg': 6500, '5kg': 7500, '10kg': 8500, '20kg': 10500, '30kg': 13500 },
  },
};

const WEIGHT_OPTIONS = ['2kg', '5kg', '10kg', '20kg', '30kg'];

const WEIGHT_LABELS: Record<string, string> = {
  '2kg': '~ 2kg',
  '5kg': '~ 5kg',
  '10kg': '~ 10kg',
  '20kg': '~ 20kg',
  '30kg': '~ 30kg',
};

export default function ShippingCalculator() {
  const [weight, setWeight] = useState('2kg');
  const [region, setRegion] = useState<Region>('normal');

  return (
    <Card className="border-t-4 border-t-orange-500">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-slate-700 flex items-center gap-2">
          <Truck className="w-4 h-4 text-orange-500" />
          배송비 계산기
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* 무게 선택 */}
        <div>
          <label className="text-xs text-slate-500 mb-1.5 block">상품 무게</label>
          <div className="grid grid-cols-5 gap-1">
            {WEIGHT_OPTIONS.map((w) => (
              <button
                key={w}
                onClick={() => setWeight(w)}
                className={`py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                  weight === w
                    ? 'bg-orange-500 text-white border-orange-500 shadow-sm'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {WEIGHT_LABELS[w]}
              </button>
            ))}
          </div>
        </div>

        {/* 지역 선택 */}
        <div>
          <label className="text-xs text-slate-500 mb-1.5 block">배송 지역</label>
          <div className="flex gap-2">
            {([['normal', '일반지역'], ['remote', '도서산간']] as const).map(([r, label]) => (
              <button
                key={r}
                onClick={() => setRegion(r)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors border ${
                  region === r
                    ? 'bg-orange-500 text-white border-orange-500 shadow-sm'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* 결과 테이블 */}
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <div className="bg-slate-50 px-3 py-2 grid grid-cols-3 text-xs text-slate-500 font-medium border-b border-slate-200">
            <span>택배사</span>
            <span className="text-center">기본 배송비</span>
            <span className="text-right">박스당 단가</span>
          </div>
          {CARRIERS.map(({ id, name }, idx) => {
            const fee = FEE_TABLE[id][region][weight];
            return (
              <div
                key={id}
                className={`px-3 py-2.5 grid grid-cols-3 items-center text-sm ${idx < CARRIERS.length - 1 ? 'border-b border-slate-100' : ''}`}
              >
                <span className="text-slate-700 font-medium">{name}</span>
                <span className="text-center font-bold text-slate-900">
                  {fee.toLocaleString()}원
                </span>
                <span className="text-right text-xs text-slate-500">
                  {(fee / 10).toLocaleString()}원/개 <span className="text-slate-300">(×10)</span>
                </span>
              </div>
            );
          })}
        </div>

        {region === 'remote' && (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            ⚠️ 도서산간 지역은 제주, 울릉도, 백령도 등 추가 배송비가 발생합니다. 스마트스토어 설정에서 도서산간 배송비를 별도 설정하세요.
          </p>
        )}

        <p className="text-xs text-slate-400 text-center">
          2024년 기준 · 계약 물량에 따라 실제 운임 상이
        </p>
      </CardContent>
    </Card>
  );
}

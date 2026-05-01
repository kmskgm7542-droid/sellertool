'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Calculator } from 'lucide-react';
import { calcCostRatio } from '@/lib/analysis';
import type { CostRatioData } from '@/types';

const gradeBadge = {
  excellent: { label: '우수 (20% 이하)', bgClass: 'bg-emerald-500' },
  pass: { label: '합격 (30% 이하)', bgClass: 'bg-blue-500' },
  fail: { label: '불합격 (30% 초과)', bgClass: 'bg-red-500' },
};

export default function CostCalculator() {
  const [form, setForm] = useState({
    costCNY: '',
    sellPriceKRW: '',
    platform: 'smartstore' as 'smartstore' | 'coupang',
    exchangeRate: '190',
    shippingCostKRW: '3000',
    inspectionFeeKRW: '500',
  });
  const [result, setResult] = useState<CostRatioData | null>(null);

  const handleCalc = () => {
    if (!form.costCNY || !form.sellPriceKRW) return;
    const r = calcCostRatio({
      costCNY: Number(form.costCNY),
      sellPriceKRW: Number(form.sellPriceKRW),
      platform: form.platform,
      exchangeRate: Number(form.exchangeRate),
      shippingCostKRW: Number(form.shippingCostKRW),
      customsDutyRate: 0.08,
      inspectionFeeKRW: Number(form.inspectionFeeKRW),
    });
    setResult(r);
  };

  return (
    <Card className="border-t-4 border-t-violet-500">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-slate-700 flex items-center gap-2">
          <Calculator className="w-4 h-4 text-violet-500" />
          원가율 계산기
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">1688 단가 (CNY)</label>
            <Input
              type="number"
              placeholder="예: 10"
              value={form.costCNY}
              onChange={(e) => setForm({ ...form, costCNY: e.target.value })}
              className="bg-slate-50 border-slate-200 focus:bg-white"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">판매가 (KRW)</label>
            <Input
              type="number"
              placeholder="예: 25000"
              value={form.sellPriceKRW}
              onChange={(e) => setForm({ ...form, sellPriceKRW: e.target.value })}
              className="bg-slate-50 border-slate-200 focus:bg-white"
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-slate-500 mb-1 block">플랫폼</label>
          <div className="flex gap-2">
            {(['smartstore', 'coupang'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setForm({ ...form, platform: p })}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors border ${
                  form.platform === p
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {p === 'smartstore' ? '스마트스토어' : '쿠팡'}
              </button>
            ))}
          </div>
        </div>

        <Button
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold"
          onClick={handleCalc}
        >
          계산하기
        </Button>

        {result && (
          <div className="rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 p-4 text-white space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-blue-200">원가 (KRW)</span>
              <span className="font-semibold">{result.costKRW.toLocaleString()}원</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-blue-200">플랫폼 수수료</span>
              <span className="font-semibold">{result.platformFeeKRW.toLocaleString()}원</span>
            </div>
            <div className="h-px bg-blue-500/50 my-1" />
            <div className="flex justify-between text-sm">
              <span className="text-blue-200">마진율</span>
              <span className={`font-bold text-base ${result.marginRate > 20 ? 'text-emerald-300' : 'text-red-300'}`}>
                {result.marginRate}%
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-blue-200">원가율</span>
              <div className="flex items-center gap-2">
                <span className="font-black text-xl">{result.costRatio}%</span>
                <span className={`text-xs px-2 py-0.5 rounded-full text-white font-medium ${gradeBadge[result.grade].bgClass}`}>
                  {gradeBadge[result.grade].label}
                </span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

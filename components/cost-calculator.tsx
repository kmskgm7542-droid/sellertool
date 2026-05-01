'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { calcCostRatio } from '@/lib/analysis';
import type { CostRatioData } from '@/types';

const gradeBadge = {
  excellent: { label: '우수 (20% 이하)', color: 'bg-green-600' },
  pass: { label: '합격 (30% 이하)', color: 'bg-blue-600' },
  fail: { label: '불합격 (30% 초과)', color: 'bg-red-600' },
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
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-slate-700">
          원가율 계산기
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-slate-500">1688 단가 (CNY)</label>
            <Input
              type="number"
              placeholder="예: 10"
              value={form.costCNY}
              onChange={(e) => setForm({ ...form, costCNY: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">판매가 (KRW)</label>
            <Input
              type="number"
              placeholder="예: 25000"
              value={form.sellPriceKRW}
              onChange={(e) => setForm({ ...form, sellPriceKRW: e.target.value })}
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-500">플랫폼</label>
          <div className="flex gap-2 mt-1">
            {(['smartstore', 'coupang'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setForm({ ...form, platform: p })}
                className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  form.platform === p
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {p === 'smartstore' ? '스마트스토어' : '쿠팡'}
              </button>
            ))}
          </div>
        </div>
        <Button className="w-full" onClick={handleCalc}>계산하기</Button>

        {result && (
          <div className="space-y-2 pt-2 border-t">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">원가 (KRW)</span>
              <span className="font-medium">{result.costKRW.toLocaleString()}원</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">플랫폼 수수료</span>
              <span className="font-medium">{result.platformFeeKRW.toLocaleString()}원</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">마진율</span>
              <span className={`font-bold ${result.marginRate > 20 ? 'text-green-600' : 'text-red-600'}`}>
                {result.marginRate}%
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-500">원가율</span>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg">{result.costRatio}%</span>
                <span className={`text-xs px-2 py-0.5 rounded-full text-white ${gradeBadge[result.grade].color}`}>
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

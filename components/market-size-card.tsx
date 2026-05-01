'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { MarketSizeData } from '@/types';
import LoginBlurOverlay from './login-blur-overlay';

interface MarketSizeCardProps {
  data: MarketSizeData;
}

const trendConfig = {
  rising: {
    text: '상승',
    textColor: 'text-green-700',
    bgColor: 'bg-green-50',
    borderColor: 'border-t-green-500',
    chartColor: '#16a34a',
    badgeClass: 'bg-green-100 text-green-700',
    Icon: TrendingUp,
  },
  stable: {
    text: '보합',
    textColor: 'text-amber-700',
    bgColor: 'bg-amber-50',
    borderColor: 'border-t-amber-400',
    chartColor: '#d97706',
    badgeClass: 'bg-amber-100 text-amber-700',
    Icon: Minus,
  },
  falling: {
    text: '하락',
    textColor: 'text-red-700',
    bgColor: 'bg-red-50',
    borderColor: 'border-t-red-500',
    chartColor: '#dc2626',
    badgeClass: 'bg-red-100 text-red-700',
    Icon: TrendingDown,
  },
};

function formatRevenue(amount: number): string {
  if (amount >= 100_000_000) {
    return (amount / 100_000_000).toFixed(1) + '억원';
  }
  return (amount / 10_000).toFixed(0) + '만원';
}

export default function MarketSizeCard({ data }: MarketSizeCardProps) {
  const cfg = trendConfig[data.trend];
  const { Icon } = cfg;

  return (
    <Card className={`border-t-4 ${cfg.borderColor}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-slate-700 flex items-center gap-2">
          <Icon className="w-4 h-4 text-slate-500" />
          시장 규모
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-3xl font-bold text-slate-900">
            {data.monthlySearchVolume.toLocaleString()}
            <span className="text-base font-normal text-slate-500 ml-1">건</span>
          </p>
          <p className="text-xs text-slate-400 mt-0.5">월 예상 검색량</p>
        </div>

        <div className="flex items-center justify-between text-sm py-1 border-t border-slate-100">
          <span className="text-slate-500">예상 월 거래액</span>
          <span className="font-semibold text-slate-800">
            {formatRevenue(data.estimatedMonthlyRevenue)}
          </span>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">트렌드</span>
          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.badgeClass}`}>
            <Icon className="w-3 h-3" />
            {cfg.text}
          </span>
        </div>

        <LoginBlurOverlay>
          <div className={`h-24 rounded-lg ${cfg.bgColor} p-1`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.trendData}>
                <XAxis dataKey="period" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}
                />
                <Line
                  type="monotone"
                  dataKey="ratio"
                  stroke={cfg.chartColor}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </LoginBlurOverlay>
      </CardContent>
    </Card>
  );
}

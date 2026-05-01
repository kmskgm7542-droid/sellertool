'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { MarketSizeData } from '@/types';
import LoginBlurOverlay from './login-blur-overlay';

interface MarketSizeCardProps {
  data: MarketSizeData;
  isLoggedIn: boolean;
}

const trendLabel = {
  rising: { text: '상승', color: 'text-green-600' },
  stable: { text: '보합', color: 'text-yellow-600' },
  falling: { text: '하락', color: 'text-red-600' },
};

export default function MarketSizeCard({ data, isLoggedIn }: MarketSizeCardProps) {
  const trend = trendLabel[data.trend];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-slate-700">
          시장 규모
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-3xl font-bold text-slate-900">
            {data.monthlySearchVolume.toLocaleString()}
          </p>
          <p className="text-xs text-slate-500">월 예상 검색량</p>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">예상 월 거래액</span>
          <span className="font-medium">
            {(data.estimatedMonthlyRevenue / 10000).toFixed(0)}만원
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">트렌드</span>
          <span className={`font-semibold ${trend.color}`}>{trend.text}</span>
        </div>
        <LoginBlurOverlay isLoggedIn={isLoggedIn} label="3개월 트렌드 그래프는 로그인 후 확인">
          <div className="h-24">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.trendData}>
                <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                <YAxis hide />
                <Tooltip />
                <Line type="monotone" dataKey="ratio" stroke="#2563EB" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </LoginBlurOverlay>
      </CardContent>
    </Card>
  );
}

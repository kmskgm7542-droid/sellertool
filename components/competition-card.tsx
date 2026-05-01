import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { CompetitionData } from '@/types';
import LoginBlurOverlay from './login-blur-overlay';

interface CompetitionCardProps {
  data: CompetitionData;
  isLoggedIn: boolean;
}

const formatPrice = (n: number) => n.toLocaleString('ko-KR') + '원';

export default function CompetitionCard({ data, isLoggedIn }: CompetitionCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-slate-700 flex items-center gap-2">
          경쟁 분석
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-3xl font-bold text-slate-900">
            {data.totalProducts.toLocaleString()}개
          </p>
          <p className="text-xs text-slate-500">총 등록 상품 수</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-slate-50 rounded-lg p-2">
            <p className="text-sm font-semibold text-blue-600">{formatPrice(data.minPrice)}</p>
            <p className="text-xs text-slate-400">최저가</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-2">
            <p className="text-sm font-semibold text-slate-900">{formatPrice(data.avgPrice)}</p>
            <p className="text-xs text-slate-400">평균가</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-2">
            <p className="text-sm font-semibold text-slate-900">{formatPrice(data.maxPrice)}</p>
            <p className="text-xs text-slate-400">최고가</p>
          </div>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">평균 리뷰</span>
          <span className="font-medium">{data.avgReviews.toLocaleString()}개</span>
        </div>
        <LoginBlurOverlay isLoggedIn={isLoggedIn} label="광고 밀도는 로그인 후 확인">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">광고 밀도</span>
            <Badge variant={data.adDensity > 0.5 ? 'destructive' : 'secondary'}>
              {Math.round(data.adDensity * 100)}%
            </Badge>
          </div>
        </LoginBlurOverlay>
      </CardContent>
    </Card>
  );
}

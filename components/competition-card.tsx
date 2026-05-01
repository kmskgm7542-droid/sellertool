'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingDown, TrendingUp, Minus, BarChart2, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import type { CompetitionData } from '@/types';
import LoginBlurOverlay from './login-blur-overlay';

interface CompetitionCardProps {
  data: CompetitionData;
}

const formatPrice = (n: number) => n.toLocaleString('ko-KR') + '원';
const cleanTitle = (t: string) => t.replace(/<[^>]+>/g, '');

export default function CompetitionCard({ data }: CompetitionCardProps) {
  const [showItems, setShowItems] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const adDensityHigh = data.adDensity > 0.5;
  const adDensityMid = data.adDensity > 0.3;

  const adBadgeClass = adDensityHigh
    ? 'bg-red-50 text-red-700 border-red-200'
    : adDensityMid
    ? 'bg-amber-50 text-amber-700 border-amber-200'
    : 'bg-green-50 text-green-700 border-green-200';

  const AdIcon = adDensityHigh ? TrendingUp : adDensityMid ? Minus : TrendingDown;

  const displayedItems = showAll ? data.items : data.items.slice(0, 5);

  return (
    <Card className="border-t-4 border-t-blue-500">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-slate-700 flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-blue-500" />
          경쟁 분석
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-3xl font-bold text-slate-900">
            {data.totalProducts.toLocaleString()}
            <span className="text-base font-normal text-slate-500 ml-1">개</span>
          </p>
          <p className="text-xs text-slate-400 mt-0.5">총 등록 상품 수</p>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-2">
            <p className="text-sm font-bold text-blue-700">{formatPrice(data.minPrice)}</p>
            <p className="text-xs text-blue-400 mt-0.5">최저가</p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-2">
            <p className="text-sm font-bold text-slate-700">{formatPrice(data.avgPrice)}</p>
            <p className="text-xs text-slate-400 mt-0.5">평균가</p>
          </div>
          <div className="bg-slate-100 border border-slate-200 rounded-lg p-2">
            <p className="text-sm font-bold text-slate-600">{formatPrice(data.maxPrice)}</p>
            <p className="text-xs text-slate-400 mt-0.5">최고가</p>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm py-1 border-t border-slate-100">
          <span className="text-slate-500">평균 리뷰</span>
          <span className="font-semibold text-slate-800">{data.avgReviews.toLocaleString()}개</span>
        </div>

        <LoginBlurOverlay>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">광고 밀도</span>
            <Badge className={`border text-xs font-medium flex items-center gap-1 ${adBadgeClass}`}>
              <AdIcon className="w-3 h-3" />
              {Math.round(data.adDensity * 100)}%
            </Badge>
          </div>
        </LoginBlurOverlay>

        {data.items.length > 0 && (
          <div className="border-t border-slate-100 pt-2">
            <button
              onClick={() => setShowItems(!showItems)}
              className="w-full flex items-center justify-between text-xs text-slate-500 hover:text-slate-700 transition-colors py-1"
            >
              <span>상품 목록 {data.items.length}개</span>
              {showItems ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showItems && (
              <div className="mt-2 space-y-1.5">
                {displayedItems.map((item, idx) => (
                  <a
                    key={item.productId || idx}
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-50 transition-colors group"
                  >
                    {item.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.image}
                        alt=""
                        className="w-8 h-8 rounded object-cover flex-shrink-0 bg-slate-100"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-700 truncate leading-snug">
                        {cleanTitle(item.title)}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {Number(item.lprice).toLocaleString()}원 · {item.mallName}
                      </p>
                    </div>
                    <ExternalLink className="w-3 h-3 text-slate-300 group-hover:text-slate-500 flex-shrink-0" />
                  </a>
                ))}

                {data.items.length > 5 && (
                  <button
                    onClick={() => setShowAll(!showAll)}
                    className="w-full text-center text-xs text-blue-500 hover:text-blue-700 py-1 transition-colors"
                  >
                    {showAll ? '접기' : `${data.items.length - 5}개 더 보기`}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

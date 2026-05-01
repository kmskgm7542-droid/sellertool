'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Copy, Save } from 'lucide-react';
import type { MarketAnalysis } from '@/types';
import LoginBlurOverlay from './login-blur-overlay';

interface SourcingReportProps {
  data: MarketAnalysis;
  isLoggedIn: boolean;
}

function generateMarkdown(data: MarketAnalysis): string {
  const { keyword, competition, marketSize, costRatio, verdict } = data;
  return `# 소싱 분석 리포트 — ${keyword}

생성일: ${new Date(data.createdAt).toLocaleDateString('ko-KR')}

## 판정: ${verdict.verdict.toUpperCase()} (${verdict.totalScore}점)

## 경쟁 분석
- 총 상품 수: ${competition.totalProducts.toLocaleString()}개
- 가격대: ${competition.minPrice.toLocaleString()}원 ~ ${competition.maxPrice.toLocaleString()}원
- 평균 리뷰: ${competition.avgReviews}개

## 시장 규모
- 월 검색량: ${marketSize.monthlySearchVolume.toLocaleString()}
- 트렌드: ${marketSize.trend}
- 예상 월 거래액: ${(marketSize.estimatedMonthlyRevenue / 10000).toFixed(0)}만원

## 원가율
${costRatio ? `- 원가(KRW): ${costRatio.costKRW.toLocaleString()}원\n- 원가율: ${costRatio.costRatio}%\n- 마진율: ${costRatio.marginRate}%\n- 등급: ${costRatio.grade}` : '미입력'}

## 점수 상세
- 경쟁 강도: ${verdict.competitionScore}/40
- 원가율: ${verdict.costScore}/30
- 성장성: ${verdict.growthScore}/30
`;
}

export default function SourcingReport({ data, isLoggedIn }: SourcingReportProps) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const markdown = generateMarkdown(data);

  const handleCopy = () => {
    navigator.clipboard.writeText(markdown);
  };

  const handleDownload = () => {
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `소싱리포트_${data.keyword}_${new Date().toISOString().split('T')[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: data.keyword, reportData: data }),
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const reportContent = (
    <div className="bg-slate-50 rounded-lg p-4 text-sm font-mono whitespace-pre-wrap text-slate-700 max-h-64 overflow-y-auto">
      {markdown}
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-slate-700 flex items-center justify-between">
          <span>소싱 분석 리포트</span>
          {isLoggedIn && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handleCopy}>
                <Copy className="w-3 h-3 mr-1" />복사
              </Button>
              <Button size="sm" variant="outline" onClick={handleDownload}>
                <Download className="w-3 h-3 mr-1" />다운로드
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving || saved}>
                <Save className="w-3 h-3 mr-1" />
                {saved ? '저장됨' : saving ? '저장 중...' : '저장'}
              </Button>
            </div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <LoginBlurOverlay isLoggedIn={isLoggedIn} label="전체 리포트는 로그인 후 이용하세요">
          {reportContent}
        </LoginBlurOverlay>
      </CardContent>
    </Card>
  );
}

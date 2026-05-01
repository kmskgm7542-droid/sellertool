'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Copy, CheckCheck, FileText, Table } from 'lucide-react';
import { useState } from 'react';
import type { MarketAnalysis } from '@/types';

interface SourcingReportProps {
  data: MarketAnalysis;
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

function generateCSV(data: MarketAnalysis): string {
  const { keyword, competition, marketSize, costRatio, verdict } = data;
  const rows: string[][] = [
    ['항목', '값'],
    ['키워드', keyword],
    ['생성일', new Date(data.createdAt).toLocaleDateString('ko-KR')],
    ['판정', verdict.verdict.toUpperCase()],
    ['총점', String(verdict.totalScore)],
    ['', ''],
    ['[경쟁 분석]', ''],
    ['총 상품 수', String(competition.totalProducts)],
    ['최저가(원)', String(competition.minPrice)],
    ['평균가(원)', String(competition.avgPrice)],
    ['최고가(원)', String(competition.maxPrice)],
    ['평균 리뷰', String(competition.avgReviews)],
    ['광고 밀도(%)', String(Math.round(competition.adDensity * 100))],
    ['', ''],
    ['[시장 규모]', ''],
    ['월 검색량', String(marketSize.monthlySearchVolume)],
    ['예상 월 거래액(원)', String(marketSize.estimatedMonthlyRevenue)],
    ['트렌드', marketSize.trend],
    ['', ''],
    ['[원가율]', ''],
    ['원가(원)', costRatio ? String(costRatio.costKRW) : '미입력'],
    ['원가율(%)', costRatio ? String(costRatio.costRatio) : '미입력'],
    ['마진율(%)', costRatio ? String(costRatio.marginRate) : '미입력'],
    ['등급', costRatio ? costRatio.grade : '미입력'],
    ['', ''],
    ['[점수 상세]', ''],
    ['경쟁 강도', `${verdict.competitionScore}/40`],
    ['원가율 점수', `${verdict.costScore}/30`],
    ['성장성 점수', `${verdict.growthScore}/30`],
  ];

  if (competition.items.length > 0) {
    rows.push(['', ''], ['[상품 목록]', ''], ['상품명', '최저가', '쇼핑몰'].join(',') ? ['상품명', '최저가(원)', '쇼핑몰'] : []);
    competition.items.forEach((item) => {
      rows.push([
        item.title.replace(/<[^>]+>/g, '').replace(/,/g, ' '),
        item.lprice,
        item.mallName,
      ]);
    });
  }

  const csv = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  return '﻿' + csv; // BOM for Excel Korean
}

export default function SourcingReport({ data }: SourcingReportProps) {
  const markdown = generateMarkdown(data);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadMd = () => {
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `소싱리포트_${data.keyword}_${new Date().toISOString().split('T')[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadCsv = () => {
    const csv = generateCSV(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `소싱리포트_${data.keyword}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader className="pb-3 bg-gradient-to-r from-blue-600 to-blue-700 rounded-t-xl">
        <CardTitle className="text-base font-semibold text-white flex items-center justify-between flex-wrap gap-2">
          <span className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            소싱 분석 리포트
          </span>
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              variant="ghost"
              onClick={handleCopy}
              className="h-8 text-white hover:bg-white/20 border border-white/30 text-xs gap-1.5"
            >
              {copied ? (
                <>
                  <CheckCheck className="w-3 h-3 text-emerald-300" />
                  복사됨
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  복사
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDownloadMd}
              className="h-8 text-white hover:bg-white/20 border border-white/30 text-xs gap-1.5"
            >
              <Download className="w-3 h-3" />
              MD
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDownloadCsv}
              className="h-8 text-white hover:bg-white/20 border border-white/30 text-xs gap-1.5"
            >
              <Table className="w-3 h-3" />
              CSV
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm font-mono whitespace-pre-wrap text-slate-700 max-h-64 overflow-y-auto leading-relaxed">
          {markdown}
        </div>
      </CardContent>
    </Card>
  );
}

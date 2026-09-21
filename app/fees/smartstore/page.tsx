import type { Metadata } from 'next';
import Header from '@/components/header';
import CostCalculator from '@/components/cost-calculator';

export const metadata: Metadata = {
  title: '스마트스토어 수수료 계산 — 판매수수료·마진율 바로 확인 | 셀러툴',
  description:
    '네이버 스마트스토어 판매수수료는 2.73%(브랜드스토어 3.64%). 2025년 6월 개편 기준 수수료 구조와 마진율·원가율을 계산기로 바로 확인하세요.',
  alternates: { canonical: '/fees/smartstore' },
};

// FAQ 구조화 데이터 — 아래 가시 텍스트(FAQ 섹션)와 글자까지 동일해야 한다.
const FAQ = [
  {
    q: '스마트스토어 판매수수료는 몇 %인가요?',
    a: '2025년 6월 개편 이후 유입 경로와 무관하게 스마트스토어 2.73%, 브랜드스토어 3.64%의 판매수수료가 부과됩니다. 결제수수료는 별도이며 사업자 등급에 따라 다릅니다.',
  },
  {
    q: '네이버쇼핑 유입수수료 2%는 없어졌나요?',
    a: '네. 2025년 6월 2일 수수료 개편으로 네이버쇼핑 경유 시에만 붙던 유입수수료(2%)는 폐지되고, 유입 경로와 무관한 판매수수료 체계로 통합되었습니다.',
  },
  {
    q: '마진율은 어떻게 계산하나요?',
    a: '마진율(%) = (판매가 − 원가 − 플랫폼 수수료) ÷ 판매가 × 100 입니다. 이 페이지의 계산기에 1688 단가와 판매가를 넣으면 관세·배송비까지 반영해 바로 계산됩니다.',
  },
  {
    q: '원가율은 몇 %가 적정한가요?',
    a: '셀러툴 기준으로 원가율 20% 이하는 우수, 30% 이하는 합격, 30% 초과는 불합격으로 판정합니다.',
  },
];

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map(({ q, a }) => ({
    '@type': 'Question',
    name: q,
    acceptedAnswer: { '@type': 'Answer', text: a },
  })),
};

export default function SmartstoreFeePage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 mb-4">
          스마트스토어 수수료, 얼마나 떼일까?
        </h1>

        <p className="text-slate-700 text-sm sm:text-base leading-relaxed mb-6">
          <strong>
            결론부터: 네이버 스마트스토어 판매수수료는 2.73%, 브랜드스토어는 3.64%입니다
          </strong>
          (2025년 6월 개편, 유입 경로 무관 · 결제수수료 별도 · 기준일 2026-09-21). 수수료율은 수시로
          변경되므로 최종 확인은 네이버 스마트스토어센터 공식 공지 기준으로 하세요.
        </p>

        <div className="overflow-x-auto mb-8">
          <table className="w-full text-sm bg-white rounded-xl border border-slate-200">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="p-3">구분</th>
                <th className="p-3">판매수수료</th>
                <th className="p-3">비고</th>
              </tr>
            </thead>
            <tbody className="text-slate-700">
              <tr className="border-b border-slate-100">
                <td className="p-3 font-medium">스마트스토어</td>
                <td className="p-3 font-bold">2.73%</td>
                <td className="p-3">유입 경로 무관 (2025-06 개편)</td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="p-3 font-medium">브랜드스토어</td>
                <td className="p-3 font-bold">3.64%</td>
                <td className="p-3">마케팅 링크 유형 따라 1~4% 구간 존재</td>
              </tr>
              <tr>
                <td className="p-3 font-medium">결제수수료</td>
                <td className="p-3 font-bold">별도</td>
                <td className="p-3">결제수단·사업자 등급별 상이</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h2 className="text-lg font-bold text-slate-900 mb-3">
          내 상품으로 바로 계산해 보기
        </h2>
        <p className="text-slate-600 text-sm mb-4">
          아래 계산기는 1688 단가(위안화)에 환율·배송비·관세(8%)·검품비를 더해 원가를 만들고, 플랫폼
          수수료(스마트스토어 평균 3.18% 가정)를 빼서 마진율·원가율을 판정합니다.
        </p>
        <div className="mb-10">
          <CostCalculator />
        </div>

        <h2 className="text-lg font-bold text-slate-900 mb-4">자주 묻는 질문</h2>
        <div className="space-y-4 mb-10">
          {FAQ.map(({ q, a }) => (
            <div key={q} className="bg-white rounded-xl border border-slate-200 p-4">
              <h3 className="font-semibold text-slate-900 text-sm mb-1.5">{q}</h3>
              <p className="text-slate-600 text-sm leading-relaxed">{a}</p>
            </div>
          ))}
        </div>

        <div className="text-xs text-slate-400">
          기준일 2026-09-21 · 요율은 수시 변경될 수 있음 · 출처: 네이버 2025-06 수수료 개편 공지
          기반 자체 정리 · 키워드 경쟁·시장규모까지 보려면{' '}
          <a href="/" className="underline text-blue-500">
            셀러툴 메인
          </a>
          에서 검색하세요.
        </div>
      </main>
    </div>
  );
}

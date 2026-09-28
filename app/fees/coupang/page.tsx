import type { Metadata } from 'next';
import Header from '@/components/header';
import CostCalculator from '@/components/cost-calculator';

export const metadata: Metadata = {
  title: '쿠팡 판매수수료 계산 — 카테고리별 수수료·마진율 확인 | 셀러툴',
  description:
    '쿠팡 판매수수료는 2026년 개편 기준 최종 결제금액의 약 4~10.9%(카테고리별, 결제수수료 포함). 수수료 구조와 마진율·원가율을 계산기로 바로 확인하세요.',
  alternates: { canonical: '/fees/coupang' },
};

// FAQ 구조화 데이터 — 아래 가시 텍스트(FAQ 섹션)와 글자까지 동일해야 한다.
const FAQ = [
  {
    q: '쿠팡 판매수수료는 몇 %인가요?',
    a: '2026년 개편 기준, 최종 결제금액에 카테고리별 약 4~10.9%의 수수료(결제수수료 포함)가 부과됩니다. 정확한 요율은 카테고리마다 다르므로 쿠팡 윙(WING)의 수수료 안내에서 확인해야 합니다.',
  },
  {
    q: '2026년 쿠팡 수수료 개편의 핵심은 무엇인가요?',
    a: '할인 전 판매가가 아니라 쿠폰·할인이 적용된 최종 결제금액을 기준으로 수수료를 부과하는 방식으로 바뀐 것이 핵심입니다.',
  },
  {
    q: '쿠팡파트너스 수수료와는 다른 건가요?',
    a: '다릅니다. 판매수수료는 상품을 파는 셀러가 쿠팡에 내는 비용이고, 쿠팡파트너스는 외부 홍보자가 받는 어필리에이트 수수료(기본 3%)입니다.',
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

export default function CoupangFeePage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 mb-4">
          쿠팡 판매수수료, 얼마나 떼일까?
        </h1>

        <p className="text-slate-700 text-sm sm:text-base leading-relaxed mb-6">
          <strong>
            결론부터: 쿠팡 판매수수료는 최종 결제금액의 약 4~10.9%입니다 (카테고리별 상이, 결제수수료
            포함)
          </strong>
          (2026년 개편 기준 · 기준일 2026-09-21). 요율은 카테고리·정책에 따라 수시 변경되므로 최종
          확인은 쿠팡 윙(WING)의 공식 수수료 안내 기준으로 하세요.
        </p>

        <div className="overflow-x-auto mb-8">
          <table className="w-full text-sm bg-white rounded-xl border border-slate-200">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="p-3">구분</th>
                <th className="p-3">내용</th>
              </tr>
            </thead>
            <tbody className="text-slate-700">
              <tr className="border-b border-slate-100">
                <td className="p-3 font-medium">부과 기준</td>
                <td className="p-3">
                  <strong>최종 결제금액</strong> (쿠폰·할인 적용 후, 2026 개편)
                </td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="p-3 font-medium">요율 범위</td>
                <td className="p-3">
                  카테고리별 약 <strong>4~10.9%</strong> (결제수수료 포함)
                </td>
              </tr>
              <tr>
                <td className="p-3 font-medium">로켓그로스</td>
                <td className="p-3">판매수수료와 별도로 물류비·보관료 발생</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h2 className="text-lg font-bold text-slate-900 mb-3">
          내 상품으로 바로 계산해 보기
        </h2>
        <p className="text-slate-600 text-sm mb-4">
          아래 계산기는 1688 단가(위안화)에 환율·배송비·관세(8%)·검품비를 더해 원가를 만들고, 플랫폼
          수수료(쿠팡 평균 7% 가정)를 빼서 마진율·원가율을 판정합니다. 플랫폼에서 쿠팡을 선택하세요.
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
          기준일 2026-09-21 · 요율은 수시 변경될 수 있음 · 출처: 쿠팡 2026 수수료 개편 공지 기반 자체
          정리 · 키워드 경쟁·시장규모까지 보려면{' '}
          <a href="/" className="underline text-blue-500">
            셀러툴 메인
          </a>
          에서 검색하세요.
        </div>
      </main>
    </div>
  );
}

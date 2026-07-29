# 🚀 sellertool 작업 시작 — 여기부터 읽으세요

> 새 세션(새 창)에서 이 프로젝트를 열면 이 문서를 가장 먼저 읽고 시작한다.
> 정리: 2026-07-29.

## 이 프로젝트가 무엇인가
- **sellertool** = 셀러용 **상품 소싱 판단 웹도구**. 키워드를 넣으면 네이버 쇼핑 데이터로 **경쟁·시장규모·원가·진입판정(GO/HOLD/NO-GO)**을 5초에 내준다.
- 대표(나비부자) **부업 = 커머스(역직구/소싱)** 라인의 핵심 도구.
- ⚠️ **저장소: `sellertool`** (github.com/kmskgm7542-droid/sellertool). **티원(navi-ev-trading = 자동매매)과 완전 별개 프로젝트.** 헷갈리지 말 것.
- 자산증식 전략 배경 → `ASSET_GROWTH_PLAN.md`

## 기술 스택
Next.js 16 · React 19 · Supabase(DB/인증) · next-auth · recharts(차트) · shadcn/radix · Tailwind4 · TypeScript · Jest

## 현재 구현된 기능 (app/·components/·lib/)
- **검색**: 키워드 입력 → `/api/analyze`
- **경쟁 분석**: 상품 수·가격대(min/avg/max)·리뷰·광고밀도 (`competition-card`)
- **시장 규모**: 월 검색량·추정 거래액·트렌드 (`market-size-card`, 네이버 트렌드)
- **원가 계산기**: 중국 위안 원가 → 마진율·원가율(스마트스토어/쿠팡) (`cost-calculator`)
- **진입 판정**: 경쟁+원가+성장 점수 → GO/HOLD/NO-GO (`entry-verdict`)
- **소싱 리포트 / 배송 계산기** (`sourcing-report`, `shipping-calculator`)
- **저장**: Supabase에 리포트·검색이력 (`SavedReport`, `SearchHistory`)
- **네이버 연동**: `lib/naver.ts` (쇼핑 검색 API)

## 필요 환경변수 (.env)
- `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` (네이버 개발자센터)
- Supabase URL/KEY (next-auth·DB)
> `.env.template` 참조. 키·시크릿은 커밋 금지.

## 현재 상태 & 다음 할 일
- API 골격 + UI 컴포넌트 구현됨. **실동작 완성도(실제 네이버 응답·판정 정확도·인증 흐름)는 미검증** → 1순위: 완성도 진단.
- 다음 로드맵(`ASSET_GROWTH_PLAN.md`와 연동):
  1. **완성도 진단** — 로컬 실행(`npm i && npm run dev`), 네이버 키 넣고 실제 판정 확인, 테스트 통과
  2. **크로스보더 확장** — 국내 소싱판단 → 일본 큐텐재팬/아마존 데이터 추가 (역직구 판단)
  3. **자동화·알림** — 텔레그램 봇으로 GO 상품 알림, 스케줄 리서치
  4. **SaaS화** — 네비부자 커뮤니티 대상 구독 도구

## 새 창 첫 프롬프트 (복붙)
```
START_HERE.md 와 ASSET_GROWTH_PLAN.md 읽고, 먼저 완성도 진단부터 해줘.
npm install 후 dev 서버 띄우고, 네이버 API가 실제로 응답하는지·진입판정이 나오는지 확인해서 미완성 부분을 정리해줘.
```

## ⚠️ 규칙
- 티원(자동매매)과 별개. 이 repo는 커머스 소싱 도구.
- API 키·시크릿·개인정보 커밋/노출 금지.

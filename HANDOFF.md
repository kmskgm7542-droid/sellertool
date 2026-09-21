# 📋 HANDOFF — sellertool 진행계획 & 세션 인수인계

> 새 세션(폰 claude.ai/code 포함)은 이 파일만 읽으면 현재 상태와 다음 할 일을 이어받을 수 있다.
> 작성: 2026-07-30. 배경 문서: `START_HERE.md`(프로젝트 소개) · `ASSET_GROWTH_PLAN.md`(전략).
> ⭐ **2026-07-30 전략 재점검 완료** → `EXEC_REVIEW_2026-07.md` (틱톡샵재팬·엔저·MCP 상품화·규제 변화 반영. 아래 Phase 계획보다 우선함)

## 🎉 2026-09-21 진행 로그 — 첫 배포 + 네이버 등록 완료

- **실서비스 배포 완료**: https://sellertool.vercel.app (Vercel, master 브랜치 자동 배포)
  - ⚠️ `seller-tool.vercel.app`(하이픈)은 **타사(독일 SellerTool) 소유** — 절대 사용 금지. 우리 주소는 하이픈 없는 `sellertool.vercel.app`
  - 빌드 실패 원인이었던 빈 환경변수 → `new URL('')` 버그 수정됨 (`lib/config.ts`의 `||` 폴백)
- **네이버 서치어드바이저 등록 완료**: 소유확인(HTML 파일 `public/naverf89...html`) + 사이트맵 제출 + 웹 페이지 수집 요청까지 완료. 수 일~2주 내 검색 노출 시작 예상
- **검색·AI 기초 공사 배포됨**: robots.ts(AI 크롤러 10종 허용) · sitemap.ts · llms.txt · JSON-LD · canonical
- **남은 일**: ① Bing 웹마스터 등록(bing.com/webmasters) ② Vercel 중복 프로젝트 3개 삭제(셀러트루-BR83·Sellertool-kr·판매자-도구) ③ 네이버 API 키 발급(아래 블로커 — 분석 기능 가동) ④ 14일 후 재측정(10/5경: 서치어드바이저 노출·클릭 기준선)

## 현재 상태 — 완성도 진단 결과 (2026-07-30 실측)

| 항목 | 결과 |
|---|---|
| `npm install` | ✅ 정상 |
| `npm test` (Jest) | ✅ 7/7 통과 (`__tests__/analysis.test.ts`) |
| `npm run build` (Next.js 16.2.4) | ✅ 성공 — TypeScript 검사 포함 |
| API 라우트 | `/api/analyze` · `/api/naver/search` · `/api/naver/trends` · `/api/image-analyze` · `/api/reports` · `/api/auth/[...nextauth]` |
| 실동작 (네이버 실응답·판정·인증) | ⏳ **미검증 — API 키 없음** (아래 블로커) |

정적 품질(빌드·테스트·타입)은 문제 없음. **남은 건 실제 키를 넣고 돌려보는 실동작 검증뿐.**

## 🚧 블로커 — CEO 준비물 (키 발급)

`.env.template`를 `.env.local`로 복사 후 채울 것. 실제 키는 커밋 금지.

1. **네이버 개발자센터** `NAVER_CLIENT_ID/SECRET` — ★필수. 없으면 분석 기능 전체 불가. (developers.naver.com → 애플리케이션 등록 → 검색·데이터랩 API)
2. **Supabase** URL/ANON_KEY/SERVICE_ROLE_KEY — 리포트 저장·인증에 필요. (supabase.com 무료 프로젝트)
3. 카카오 로그인 키 — 선택 (로그인 기능 켤 때)
4. `ANTHROPIC_API_KEY` — 선택 (이미지 분석 기능)

## 진행계획 (우선순위 순)

### Phase 1 — 실동작 검증 (키 받는 즉시, 반나절)
- [ ] `.env.local` 작성 → `npm run dev` → 키워드 검색 → 경쟁분석·시장규모·GO/HOLD/NO-GO 실판정 확인
- [ ] 네이버 실응답 스키마와 코드 가정 불일치 수정
- [ ] Supabase 리포트 저장/조회 확인
- 완료 기준: 실키로 검색→판정→저장 풀사이클 성공

### Phase 2 — 구버전(seller-tool, Python) 정량엔진 흡수 (1~2주)
> 상세: `ASSET_GROWTH_PLAN.md` "구버전 자산 흡수" 섹션
- [ ] 정량 분석엔진 TS 포팅 — 시장규모 추정(검색비율→월검색수→전환율→거래액)·12개월 매출예측·손익분기·HHI+리뷰장벽 포화도·가격 3전략
- [ ] 급상승 트렌드 스캐너 — 8카테고리 ~80 시드키워드 + 데이터랩 증감률 임계 탐지
- [ ] 포팅 로직마다 Jest 테스트 추가
- ⛔ 크롤링·봇감지 우회 코드는 흡수 금지 (공식 API only)
- [ ] 완료 후 구버전 repo 아카이브 (삭제 금지)

### Phase 3 — 큐텐재팬 크로스보더 확장 (2~4주)
- [ ] 큐텐재팬 데이터 소스 조사·연동 설계 (공식 API 우선)
- [ ] 국내 도매가 vs 큐텐 판매가 → 역직구 마진 판정 카드
- [ ] 카테고리 우선: K뷰티 > K패션 > K리빙 > K푸드

### Phase 4 — 자동화·알림 (Phase 2 이후)
- [ ] 스케줄 리서치: 매일 시드키워드 스캔 → GO 상품 자동 발굴
- [ ] 알림 채널 배선 — ⚠️ **CEO 결정 대기**: 텔레그램 제외 시 대안(이메일/디스코드/카톡 알림톡) 선택 필요
- [ ] 쿠팡 연계는 파트너스 공식 API로만 (deal-hunter 프로젝트와 연결 지점)

### Phase 5 — SaaS화 (실사용 검증 후)
- [ ] 네비부자 커뮤니티 대상 구독 모델 (초기 10명×19,900원 목표)
- [ ] 배포(Vercel)·요금제·사용량 제한 설계

## ⚠️ 규칙 (변경 없음)
- 티원(navi-ev-trading, 자동매매)과 완전 별개 repo. 혼동 금지.
- API 키·시크릿·개인정보 커밋/노출 금지. 공식 API only.

## 새 세션 첫 프롬프트 (복붙)
```
HANDOFF.md 읽고 현재 Phase에서 이어서 진행해줘.
```

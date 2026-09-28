export const config = {
  // ||: 빈 문자열로 주입된 환경변수도 기본값으로 대체 (빈 값이면 new URL()이 빌드를 깨뜨림)
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'https://sellertool.vercel.app',
  siteName: '셀러툴',
  siteDescription: '키워드 하나로 경쟁 분석 + 원가율 + 시장 진입 판정까지',
  gaId: process.env.NEXT_PUBLIC_GA_ID ?? '',
} as const;

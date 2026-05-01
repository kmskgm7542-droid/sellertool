export const config = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://seller-tool.vercel.app',
  siteName: '셀러툴',
  siteDescription: '키워드 하나로 경쟁 분석 + 원가율 + 시장 진입 판정까지',
  gaId: process.env.NEXT_PUBLIC_GA_ID ?? '',
} as const;

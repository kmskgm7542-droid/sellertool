import type { MetadataRoute } from 'next';
import { config } from '@/lib/config';

// GEO 정책: 검색·AI 인용 유입이 목표 → 검색엔진 + AI 크롤러(학습/색인/실시간 fetch) 전부 허용.
// /api/ 는 색인 대상이 아니므로 크롤 예산 절약을 위해 차단.
const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'CCBot',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: '/api/',
      },
      {
        userAgent: AI_CRAWLERS,
        allow: '/',
        disallow: '/api/',
      },
    ],
    sitemap: `${config.siteUrl}/sitemap.xml`,
  };
}

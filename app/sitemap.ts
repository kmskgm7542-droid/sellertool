import type { MetadataRoute } from 'next';
import { config } from '@/lib/config';

// 현재 공개 페이지는 메인 1개. 의도 랜딩 페이지가 추가되면 반드시 여기에도 등록할 것
// (새 콘텐츠 유형을 만들면 사이트맵에 넣는 것까지가 출시다).
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: config.siteUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
  ];
}

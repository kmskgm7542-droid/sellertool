const NAVER_API_BASE = 'https://openapi.naver.com/v1';

interface NaverShoppingApiResponse {
  lastBuildDate: string;
  total: number;
  start: number;
  display: number;
  items: Array<{
    title: string;
    link: string;
    image: string;
    lprice: string;
    hprice: string;
    mallName: string;
    productId: string;
    category1: string;
  }>;
}

export async function searchNaverShopping(keyword: string, display = 100): Promise<NaverShoppingApiResponse> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Naver API 환경변수(NAVER_CLIENT_ID, NAVER_CLIENT_SECRET)가 설정되지 않았습니다.');
  }

  const headers = {
    'X-Naver-Client-Id': clientId,
    'X-Naver-Client-Secret': clientSecret,
  };

  const params = new URLSearchParams({
    query: keyword,
    display: String(display),
    sort: 'sim',
  });

  const res = await fetch(`${NAVER_API_BASE}/search/shop.json?${params}`, {
    headers,
    next: { revalidate: 300 },
  });

  if (!res.ok) {
    throw new Error(`Naver Shopping API error: ${res.status}`);
  }

  return res.json();
}

export async function getNaverShoppingTrend(keyword: string) {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Naver API 환경변수(NAVER_CLIENT_ID, NAVER_CLIENT_SECRET)가 설정되지 않았습니다.');
  }

  const headers = {
    'X-Naver-Client-Id': clientId,
    'X-Naver-Client-Secret': clientSecret,
  };

  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 12);

  const formatDate = (d: Date) => d.toISOString().split('T')[0];

  const body = {
    startDate: formatDate(startDate),
    endDate: formatDate(endDate),
    timeUnit: 'month',
    category: [{ name: keyword, param: [keyword] }],
  };

  const res = await fetch(`${NAVER_API_BASE}/datalab/shopping/categories`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    throw new Error(`Naver DataLab API error: ${res.status}`);
  }

  return res.json();
}

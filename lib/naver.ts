const NAVER_API_BASE = 'https://openapi.naver.com/v1';

const naverHeaders = {
  'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID!,
  'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET!,
};

export async function searchNaverShopping(keyword: string, display = 100) {
  const params = new URLSearchParams({
    query: keyword,
    display: String(display),
    sort: 'sim',
  });

  const res = await fetch(`${NAVER_API_BASE}/search/shop.json?${params}`, {
    headers: naverHeaders,
    next: { revalidate: 300 },
  });

  if (!res.ok) {
    throw new Error(`Naver Shopping API error: ${res.status}`);
  }

  return res.json();
}

export async function getNaverShoppingTrend(keyword: string) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 3);

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
      ...naverHeaders,
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

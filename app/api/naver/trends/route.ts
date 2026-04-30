import { NextRequest, NextResponse } from 'next/server';
import { getNaverShoppingTrend } from '@/lib/naver';

export async function GET(req: NextRequest) {
  const keyword = req.nextUrl.searchParams.get('keyword');

  if (!keyword) {
    return NextResponse.json({ error: '키워드를 입력하세요' }, { status: 400 });
  }

  try {
    const data = await getNaverShoppingTrend(keyword);
    return NextResponse.json(data);
  } catch (error) {
    console.error('Naver trends error:', error);
    return NextResponse.json(
      { error: '트렌드 API 호출 실패' },
      { status: 500 }
    );
  }
}

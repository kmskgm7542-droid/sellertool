import { NextRequest, NextResponse } from 'next/server';
import { getNaverShoppingTrend } from '@/lib/naver';

export async function GET(req: NextRequest) {
  const keyword = req.nextUrl.searchParams.get('keyword');

  const trimmed = keyword?.trim() ?? '';
  if (!trimmed || trimmed.length > 80) {
    return NextResponse.json({ error: '키워드는 1~80자 이내로 입력하세요' }, { status: 400 });
  }

  try {
    const data = await getNaverShoppingTrend(trimmed);
    return NextResponse.json(data);
  } catch (error) {
    console.error('Naver trends error:', error);
    return NextResponse.json(
      { error: '트렌드 API 호출 실패' },
      { status: 500 }
    );
  }
}

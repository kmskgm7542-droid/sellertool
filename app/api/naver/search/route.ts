import { NextRequest, NextResponse } from 'next/server';
import { searchNaverShopping } from '@/lib/naver';

export async function GET(req: NextRequest) {
  const keyword = req.nextUrl.searchParams.get('keyword');

  const trimmed = keyword?.trim() ?? '';
  if (!trimmed || trimmed.length > 80) {
    return NextResponse.json({ error: '키워드는 1~80자 이내로 입력하세요' }, { status: 400 });
  }

  try {
    const data = await searchNaverShopping(trimmed);
    return NextResponse.json(data);
  } catch (error) {
    console.error('Naver search error:', error);
    return NextResponse.json(
      { error: 'API 호출 실패. 잠시 후 다시 시도해주세요.' },
      { status: 500 }
    );
  }
}

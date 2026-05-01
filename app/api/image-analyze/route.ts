import { NextRequest, NextResponse } from 'next/server';

function extractKeywordFromFilename(filename: string): string {
  return filename
    .replace(/\.[^/.]+$/, '')
    .replace(/[-_\s]+/g, ' ')
    .trim();
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const imageFile = formData.get('image') as File | null;

    if (!imageFile) {
      return NextResponse.json({ error: '이미지 파일이 필요합니다' }, { status: 400 });
    }

    if (!imageFile.type.startsWith('image/')) {
      return NextResponse.json({ error: '이미지 파일만 업로드 가능합니다' }, { status: 400 });
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    if (!anthropicKey) {
      const keyword = extractKeywordFromFilename(imageFile.name) || '무선이어폰';
      return NextResponse.json({ keyword, source: 'filename' });
    }

    const bytes = await imageFile.arrayBuffer();
    const base64 = Buffer.from(bytes).toString('base64');
    const mediaType = imageFile.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 50,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: base64,
                },
              },
              {
                type: 'text',
                text: '이 이미지에 있는 상품의 이름을 한국어로 짧게 알려주세요. 예: 무선이어폰, 텀블러, 요가매트. 상품명만 2-3단어로 답하세요.',
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const fallback = extractKeywordFromFilename(imageFile.name) || '상품';
      return NextResponse.json({ keyword: fallback, source: 'filename' });
    }

    const data = await response.json();
    const keyword = (data.content?.[0]?.text ?? '').trim().replace(/[.\n]/g, '');

    return NextResponse.json({ keyword, source: 'ai' });
  } catch (error) {
    console.error('Image analyze error:', error);
    return NextResponse.json({ error: '이미지 분석 실패' }, { status: 500 });
  }
}

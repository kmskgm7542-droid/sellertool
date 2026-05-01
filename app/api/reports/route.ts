import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!(session?.user as { id?: string })?.id) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  }

  const { keyword, reportData } = await req.json();
  const userId = (session!.user as { id?: string }).id!;

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('kakao_id', userId)
    .single();

  if (!user) {
    return NextResponse.json({ error: '사용자를 찾을 수 없습니다' }, { status: 404 });
  }

  const { error } = await supabaseAdmin.from('saved_reports').insert({
    user_id: user.id,
    keyword,
    report_data: reportData,
  });

  if (error) {
    return NextResponse.json({ error: '저장 실패' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

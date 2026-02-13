import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const { userId } = await request.json();

  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    return NextResponse.json(
      { success: false, error: '아이디를 입력해주세요' },
      { status: 400 }
    );
  }

  const trimmedId = userId.trim();

  // 기존 사용자 조회
  const { data: existingUser } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('user_id', trimmedId)
    .single();

  if (existingUser) {
    return NextResponse.json({ success: true, user: existingUser, isNew: false });
  }

  // 없으면 자동 생성 (회원가입 통합)
  const { data: newUser, error } = await supabaseAdmin
    .from('users')
    .insert({ user_id: trimmedId, display_name: trimmedId })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { success: false, error: '계정 생성에 실패했습니다' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, user: newUser, isNew: true });
}

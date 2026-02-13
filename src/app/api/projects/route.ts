import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

// 프로젝트 생성
export async function POST(request: NextRequest) {
  const { userId, totalDurationSeconds } = await request.json();

  if (!userId) {
    return NextResponse.json({ error: '아이디가 필요합니다' }, { status: 400 });
  }

  const today = new Date().toISOString().split('T')[0];

  // 오늘 날짜 기준 가장 큰 순번 조회
  const { data: existing } = await supabaseAdmin
    .from('projects')
    .select('sequence_number')
    .eq('user_id', userId)
    .eq('date', today)
    .order('sequence_number', { ascending: false })
    .limit(1);

  const nextSequence = existing && existing.length > 0
    ? existing[0].sequence_number + 1
    : 1;

  const fileName = `${userId}_${today.replace(/-/g, '')}_${String(nextSequence).padStart(3, '0')}`;

  const { data: project, error } = await supabaseAdmin
    .from('projects')
    .insert({
      user_id: userId,
      date: today,
      sequence_number: nextSequence,
      file_name: fileName,
      status: 'processing',
      total_duration_seconds: totalDurationSeconds || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(project, { status: 201 });
}

// 프로젝트 목록 조회
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const year = searchParams.get('year');
  const month = searchParams.get('month');

  if (!userId) {
    return NextResponse.json({ error: '아이디가 필요합니다' }, { status: 400 });
  }

  let query = supabaseAdmin
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .order('sequence_number', { ascending: false });

  if (year && month) {
    const startDate = `${year}-${month.padStart(2, '0')}-01`;
    const endDate = new Date(Number(year), Number(month), 0).toISOString().split('T')[0];
    query = query.gte('date', startDate).lte('date', endDate);
  }

  const { data: projects, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ projects });
}

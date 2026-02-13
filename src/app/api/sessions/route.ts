import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

// 특정 세션 삭제 (CASCADE로 관련 transcriptions도 삭제됨)
export async function DELETE(request: NextRequest) {
  const { sessionId } = await request.json();

  if (!sessionId) {
    return NextResponse.json({ error: '세션 ID가 필요합니다' }, { status: 400 });
  }

  // 삭제 전에 세션의 텍스트 내용을 조회 (부분 재생성용)
  const { data: segments } = await supabaseAdmin
    .from('transcriptions')
    .select('content')
    .eq('session_id', sessionId)
    .order('segment_order');

  const removedContent = segments?.map(s => s.content).join('\n') || '';

  // 세션 삭제 (CASCADE로 transcriptions도 삭제)
  const { error } = await supabaseAdmin
    .from('sessions')
    .delete()
    .eq('id', sessionId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, removedContent });
}

// 프로젝트의 세션 목록 조회
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');

  if (!projectId) {
    return NextResponse.json({ error: '프로젝트 ID가 필요합니다' }, { status: 400 });
  }

  // 세션그룹 + 세션 조회
  const { data: groups, error: groupError } = await supabaseAdmin
    .from('session_groups')
    .select('*')
    .eq('project_id', projectId)
    .order('group_order');

  if (groupError) {
    return NextResponse.json({ error: groupError.message }, { status: 500 });
  }

  const { data: sessions, error: sessionError } = await supabaseAdmin
    .from('sessions')
    .select('*, transcriptions(content, segment_order, clock_time)')
    .eq('project_id', projectId)
    .order('session_order');

  if (sessionError) {
    return NextResponse.json({ error: sessionError.message }, { status: 500 });
  }

  // 세션그룹별로 세션 그룹핑
  const result = (groups || []).map(group => ({
    ...group,
    sessions: (sessions || [])
      .filter(s => s.session_group_id === group.id)
      .map(s => ({
        ...s,
        transcriptions: s.transcriptions?.sort(
          (a: { segment_order: number }, b: { segment_order: number }) => a.segment_order - b.segment_order
        ),
      })),
  }));

  return NextResponse.json({ sessionGroups: result });
}

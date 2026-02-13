import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const { data: templates, error } = await supabaseAdmin
    .from('template_results')
    .select('*')
    .eq('project_id', projectId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 전사 원문 (세션 정보 포함)
  const { data: transcriptions } = await supabaseAdmin
    .from('transcriptions')
    .select('id, content, timestamp_seconds, segment_order, session_id, clock_time')
    .eq('project_id', projectId)
    .order('segment_order');

  // 세션그룹 + 세션 정보 (있으면)
  const { data: sessionGroups } = await supabaseAdmin
    .from('session_groups')
    .select('*')
    .eq('project_id', projectId)
    .order('group_order');

  const { data: sessions } = await supabaseAdmin
    .from('sessions')
    .select('*')
    .eq('project_id', projectId)
    .order('session_order');

  return NextResponse.json({
    projectId,
    templates: templates || [],
    transcription: transcriptions || [],
    sessionGroups: sessionGroups || [],
    sessions: sessions || [],
  });
}

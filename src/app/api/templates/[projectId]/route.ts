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

  // 전사 원문도 함께 반환
  const { data: transcriptions } = await supabaseAdmin
    .from('transcriptions')
    .select('content, timestamp_seconds, segment_order')
    .eq('project_id', projectId)
    .order('segment_order');

  return NextResponse.json({
    projectId,
    templates: templates || [],
    transcription: transcriptions || [],
  });
}

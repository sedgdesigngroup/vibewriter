import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

// 전사 데이터 일괄 저장
export async function POST(request: NextRequest) {
  const { projectId, segments } = await request.json();

  if (!projectId || !segments || !Array.isArray(segments)) {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 });
  }

  const rows = segments.map((seg: { content: string; timestamp: number; order: number }) => ({
    project_id: projectId,
    content: seg.content,
    timestamp_seconds: seg.timestamp / 1000, // ms → seconds
    segment_order: seg.order,
  }));

  const { error } = await supabaseAdmin
    .from('transcriptions')
    .insert(rows);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, savedCount: rows.length });
}

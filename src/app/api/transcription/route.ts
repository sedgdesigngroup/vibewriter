import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

interface SegmentInput {
  content: string;
  timestamp: number;
  order: number;
  clockTime?: number;
}

interface SessionInput {
  startTime: number;
  endTime: number | null;
  segments: SegmentInput[];
}

interface SessionGroupInput {
  startTime: number;
  endTime: number | null;
  sessions: SessionInput[];
}

// 개별 세그먼트 삭제
export async function DELETE(request: NextRequest) {
  const { segmentIds } = await request.json();

  if (!segmentIds || !Array.isArray(segmentIds) || segmentIds.length === 0) {
    return NextResponse.json({ error: '삭제할 세그먼트 ID가 필요합니다' }, { status: 400 });
  }

  // 삭제 전 내용 조회 (부분 재생성용)
  const { data: segments } = await supabaseAdmin
    .from('transcriptions')
    .select('content')
    .in('id', segmentIds)
    .order('segment_order');

  const removedContent = segments?.map(s => s.content).join('\n') || '';

  // 삭제 실행
  const { error } = await supabaseAdmin
    .from('transcriptions')
    .delete()
    .in('id', segmentIds);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, removedContent });
}

// 전사 데이터 일괄 저장
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { projectId, mode } = body;

  if (!projectId) {
    return NextResponse.json({ error: '프로젝트 ID가 필요합니다' }, { status: 400 });
  }

  // 하루종일 모드: 세션그룹 + 세션 구조로 저장
  if (mode === 'allday') {
    return handleAllDayMode(projectId, body.sessionGroups);
  }

  // 기존 모드: 플랫 세그먼트 배열
  return handleStandardMode(projectId, body.segments);
}

async function handleStandardMode(projectId: string, segments: SegmentInput[]) {
  if (!segments || !Array.isArray(segments)) {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 });
  }

  const rows = segments.map((seg) => ({
    project_id: projectId,
    content: seg.content,
    timestamp_seconds: seg.timestamp / 1000,
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

async function handleAllDayMode(projectId: string, sessionGroups: SessionGroupInput[]) {
  if (!sessionGroups || !Array.isArray(sessionGroups)) {
    return NextResponse.json({ error: '세션그룹 데이터가 필요합니다' }, { status: 400 });
  }

  let totalSaved = 0;

  for (let gi = 0; gi < sessionGroups.length; gi++) {
    const group = sessionGroups[gi];

    // 세션그룹 삽입
    const { data: groupData, error: groupError } = await supabaseAdmin
      .from('session_groups')
      .insert({
        project_id: projectId,
        start_time: new Date(group.startTime).toISOString(),
        end_time: group.endTime ? new Date(group.endTime).toISOString() : null,
        group_order: gi,
      })
      .select('id')
      .single();

    if (groupError || !groupData) {
      console.error('세션그룹 저장 실패:', groupError);
      continue;
    }

    for (let si = 0; si < group.sessions.length; si++) {
      const session = group.sessions[si];

      // 세션 삽입
      const { data: sessionData, error: sessionError } = await supabaseAdmin
        .from('sessions')
        .insert({
          session_group_id: groupData.id,
          project_id: projectId,
          start_time: new Date(session.startTime).toISOString(),
          end_time: session.endTime ? new Date(session.endTime).toISOString() : null,
          session_order: si,
        })
        .select('id')
        .single();

      if (sessionError || !sessionData) {
        console.error('세션 저장 실패:', sessionError);
        continue;
      }

      // 세그먼트 삽입
      if (session.segments.length > 0) {
        const rows = session.segments.map((seg) => ({
          project_id: projectId,
          session_id: sessionData.id,
          content: seg.content,
          timestamp_seconds: seg.timestamp / 1000,
          segment_order: seg.order,
          clock_time: seg.clockTime ? new Date(seg.clockTime).toISOString() : null,
        }));

        const { error: segError } = await supabaseAdmin
          .from('transcriptions')
          .insert(rows);

        if (segError) {
          console.error('세그먼트 저장 실패:', segError);
        } else {
          totalSaved += rows.length;
        }
      }
    }
  }

  return NextResponse.json({ success: true, savedCount: totalSaved });
}

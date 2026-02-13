import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { processAllTemplates } from '@/lib/templates';
import type { TemplateType } from '@/types';

export const maxDuration = 300; // Vercel Pro: 최대 5분

export async function POST(request: NextRequest) {
  const { projectId } = await request.json();

  if (!projectId) {
    return NextResponse.json({ error: '프로젝트 ID가 필요합니다' }, { status: 400 });
  }

  // 전사 데이터 조회
  const { data: transcriptions, error: fetchError } = await supabaseAdmin
    .from('transcriptions')
    .select('content, segment_order')
    .eq('project_id', projectId)
    .order('segment_order');

  if (fetchError || !transcriptions || transcriptions.length === 0) {
    return NextResponse.json({ error: '전사 데이터가 없습니다' }, { status: 404 });
  }

  // 전사 텍스트 합치기
  const fullText = transcriptions.map(t => t.content).join('\n');

  // 2종 template_results 레코드 생성 (processing 상태)
  const types: TemplateType[] = ['card_news', 'meeting_minutes'];
  for (const type of types) {
    await supabaseAdmin
      .from('template_results')
      .upsert({
        project_id: projectId,
        template_type: type,
        status: 'processing',
        content: null,
        error_message: null,
      }, { onConflict: 'project_id,template_type' });
  }

  // 프로젝트 상태 업데이트
  await supabaseAdmin
    .from('projects')
    .update({ status: 'processing' })
    .eq('id', projectId);

  // GPT로 4종 템플릿 동시 생성
  try {
    const results = await processAllTemplates(fullText);

    // 각 결과 저장
    for (const [type, result] of Object.entries(results)) {
      await supabaseAdmin
        .from('template_results')
        .update({
          content: result.content,
          status: result.error ? 'failed' : 'completed',
          error_message: result.error,
        })
        .eq('project_id', projectId)
        .eq('template_type', type);
    }

    // 모든 템플릿 완료 여부 확인
    const allCompleted = Object.values(results).every(r => !r.error);
    await supabaseAdmin
      .from('projects')
      .update({ status: allCompleted ? 'completed' : 'failed' })
      .eq('id', projectId);

    return NextResponse.json({ success: true, results });
  } catch (err) {
    await supabaseAdmin
      .from('projects')
      .update({ status: 'failed' })
      .eq('id', projectId);

    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'GPT 처리 실패' },
      { status: 500 }
    );
  }
}

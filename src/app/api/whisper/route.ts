import { NextRequest, NextResponse } from 'next/server';
import { transcribeAudio } from '@/lib/openai/whisper';

export const maxDuration = 120; // Whisper 처리 최대 2분

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('audio') as File | null;

    if (!file) {
      return NextResponse.json({ error: '오디오 파일이 없습니다.' }, { status: 400 });
    }

    // 25MB 제한 체크
    if (file.size > 25 * 1024 * 1024) {
      return NextResponse.json(
        { error: '파일 크기가 25MB를 초과합니다.' },
        { status: 413 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await transcribeAudio(buffer, file.name || 'recording.webm');

    return NextResponse.json(result);
  } catch (err) {
    console.error('Whisper 전사 실패:', err);
    return NextResponse.json(
      { error: '전사에 실패했습니다. 다시 시도해주세요.' },
      { status: 500 }
    );
  }
}

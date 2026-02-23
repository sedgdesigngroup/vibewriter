import OpenAI, { toFile } from 'openai';

export interface WhisperSegment {
  start: number;
  end: number;
  text: string;
}

export interface WhisperResult {
  text: string;
  segments: WhisperSegment[];
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function transcribeAudio(
  audioBuffer: Buffer,
  filename: string = 'recording.webm'
): Promise<WhisperResult> {
  const file = await toFile(audioBuffer, filename, { type: 'audio/webm' });

  const response = await openai.audio.transcriptions.create({
    model: 'whisper-1',
    file,
    language: 'ko',
    response_format: 'verbose_json',
    timestamp_granularities: ['segment'],
  });

  const segments: WhisperSegment[] = ((response as { segments?: WhisperSegment[] }).segments ?? []).map((seg) => ({
    start: seg.start,
    end: seg.end,
    text: seg.text.trim(),
  }));

  return {
    text: response.text || '',
    segments: segments.filter((seg) => seg.text.length > 0),
  };
}

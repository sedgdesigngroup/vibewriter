export interface WhisperSegment {
  start: number;
  end: number;
  text: string;
}

export interface WhisperResult {
  text: string;
  segments: WhisperSegment[];
}

const TRANSCRIPTION_SERVER_URL =
  process.env.TRANSCRIPTION_SERVER_URL || 'http://localhost:8000';

export async function transcribeAudio(
  audioBuffer: Buffer,
  filename: string = 'recording.webm'
): Promise<WhisperResult> {
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(audioBuffer)], { type: 'audio/webm' });
  formData.append('audio', blob, filename);

  const res = await fetch(`${TRANSCRIPTION_SERVER_URL}/transcribe`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Faster-Whisper 전사 실패 (${res.status}): ${errorText}`);
  }

  const data = await res.json();

  return {
    text: data.text || '',
    segments: (data.segments ?? []).map((seg: WhisperSegment) => ({
      start: seg.start,
      end: seg.end,
      text: seg.text,
    })),
  };
}

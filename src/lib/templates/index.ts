import type { TemplateType } from '@/types';
import { generateTemplate, summarizeChunk } from '@/lib/openai/gpt';
import { CARD_NEWS_PROMPT } from './cardNews';
import { SHORT_STORY_PROMPT } from './shortStory';
import { KEY_POINTS_PROMPT } from './keyPoints';
import { MEETING_MINUTES_PROMPT } from './meetingMinutes';

const TEMPLATE_PROMPTS: Record<TemplateType, string> = {
  card_news: CARD_NEWS_PROMPT,
  short_story: SHORT_STORY_PROMPT,
  key_points: KEY_POINTS_PROMPT,
  meeting_minutes: MEETING_MINUTES_PROMPT,
};

// 대략적인 토큰 수 추정 (한국어: ~1.5 토큰/글자)
function estimateTokens(text: string): number {
  return Math.ceil(text.length * 1.5);
}

// 텍스트를 의미 단위로 분할
function splitText(text: string, maxTokens: number): string[] {
  const maxChars = Math.floor(maxTokens / 1.5);
  const chunks: string[] = [];
  const sentences = text.split(/(?<=[.!?。\n])\s*/);
  let current = '';

  for (const sentence of sentences) {
    if ((current + sentence).length > maxChars && current.length > 0) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current += (current ? ' ' : '') + sentence;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}

export async function processTemplate(
  transcription: string,
  templateType: TemplateType
): Promise<string> {
  const tokens = estimateTokens(transcription);
  const prompt = TEMPLATE_PROMPTS[templateType];

  // 80K 토큰 이하면 단일 패스
  if (tokens <= 80000) {
    return generateTemplate(transcription, prompt);
  }

  // Map-Reduce: 청크 분할 → 요약 → 최종 생성
  const chunks = splitText(transcription, 20000);

  const summaries = await Promise.all(
    chunks.map((chunk, i) => summarizeChunk(chunk, i, chunks.length))
  );

  const combined = summaries.join('\n\n---\n\n');
  return generateTemplate(combined, prompt);
}

export async function processAllTemplates(
  transcription: string
): Promise<Record<TemplateType, { content: string | null; error: string | null }>> {
  const types: TemplateType[] = ['card_news', 'short_story', 'key_points', 'meeting_minutes'];

  const results = await Promise.allSettled(
    types.map(type => processTemplate(transcription, type))
  );

  const output: Record<string, { content: string | null; error: string | null }> = {};

  types.forEach((type, i) => {
    const result = results[i];
    if (result.status === 'fulfilled') {
      output[type] = { content: result.value, error: null };
    } else {
      output[type] = { content: null, error: result.reason?.message || '생성 실패' };
    }
  });

  return output as Record<TemplateType, { content: string | null; error: string | null }>;
}

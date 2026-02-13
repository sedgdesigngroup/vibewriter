import type { TemplateType } from '@/types';
import { generateTemplate, summarizeChunk } from '@/lib/openai/gpt';
import { searchRelatedTopics } from '@/lib/openai/webSearch';
import { CARD_NEWS_PROMPT } from './cardNews';
import { MEETING_MINUTES_PROMPT } from './meetingMinutes';

const TEMPLATE_PROMPTS: Record<TemplateType, string> = {
  card_news: CARD_NEWS_PROMPT,
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
  templateType: TemplateType,
  webSearchContext: string
): Promise<string> {
  const tokens = estimateTokens(transcription);
  const basePrompt = TEMPLATE_PROMPTS[templateType];

  // 웹서치 컨텍스트가 있으면 프롬프트에 추가
  const prompt = webSearchContext
    ? `${basePrompt}\n\n---\n\n아래는 웹 검색을 통해 수집한 관련 정보입니다. 이 정보를 참고하여 내용을 더 풍성하게 만들어주세요. 관련 이론, 트렌드, 사례 등을 자연스럽게 녹여주세요:\n\n${webSearchContext}`
    : basePrompt;

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
  const types: TemplateType[] = ['card_news', 'meeting_minutes'];

  // 웹 검색으로 관련 정보 수집 (모든 템플릿이 공유)
  console.log('웹 검색 enrichment 시작...');
  const webSearchContext = await searchRelatedTopics(transcription);
  console.log('웹 검색 완료:', webSearchContext ? `${webSearchContext.length}자` : '결과 없음');

  const results = await Promise.allSettled(
    types.map(type => processTemplate(transcription, type, webSearchContext))
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

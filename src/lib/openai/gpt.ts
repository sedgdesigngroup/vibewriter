import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function generateTemplate(
  transcription: string,
  systemPrompt: string
): Promise<string> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: transcription },
    ],
    max_tokens: 8000,
    temperature: 0.7,
  });

  return response.choices[0]?.message?.content || '';
}

export async function summarizeChunk(
  chunk: string,
  chunkIndex: number,
  totalChunks: number
): Promise<string> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `당신은 장시간 대화 내용을 정리하는 전문가입니다.
이것은 전체 대화의 ${chunkIndex + 1}/${totalChunks} 부분입니다.

이 부분의 핵심 내용을 빠짐없이 요약해주세요:
- 모든 주요 발언을 포함
- 결정 사항이나 중요 논점을 강조
- 맥락이 유지되도록 시간 순서대로 정리
- 원본의 70-80% 정보량을 유지하면서 압축`,
      },
      { role: 'user', content: chunk },
    ],
    max_tokens: 4000,
    temperature: 0.3,
  });

  return response.choices[0]?.message?.content || '';
}

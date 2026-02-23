import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface GenerateOptions {
  maxTokens?: number;
  temperature?: number;
}

const TEMPLATE_PARAMS: Record<string, GenerateOptions> = {
  meeting_minutes: { maxTokens: 16000, temperature: 0.3 },
};

export async function generateTemplate(
  transcription: string,
  systemPrompt: string,
  templateType?: string
): Promise<string> {
  const params = templateType ? (TEMPLATE_PARAMS[templateType] ?? {}) : {};

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: transcription },
    ],
    max_tokens: params.maxTokens ?? 8000,
    temperature: params.temperature ?? 0.7,
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

export async function extractMeetingInfo(
  chunk: string,
  chunkIndex: number,
  totalChunks: number
): Promise<string> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `당신은 회의 전사 내용에서 정보를 추출하는 전문가입니다.
이것은 전체 전사 내용의 ${chunkIndex + 1}/${totalChunks} 부분입니다.

이 부분에서 다음 정보를 빠짐없이 추출해주세요:

## 추출 규칙
- 모든 발언과 논의 내용을 누락 없이 포함하세요.
- 발언자가 식별 가능하면 표시하세요.
- 구체적 수치, 날짜, 이름, 전문 용어를 그대로 유지하세요.
- 불명확한 부분은 "[불명확]"으로 표시하되 생략하지 마세요.
- 시간 순서를 유지하세요.

## 출력 형식
### 논의된 주제/안건
[이 구간에서 논의된 주제 나열]

### 발언 기록
- [발언자(식별 가능시)]: [발언 내용]
- [발언자]: [발언 내용]
...

### 결정/합의 사항
- [있는 경우 기록]

### 후속 조치 언급
- [있는 경우 기록]

### 수치/날짜/고유명사
- [언급된 구체적 정보]`,
      },
      { role: 'user', content: chunk },
    ],
    max_tokens: 6000,
    temperature: 0.2,
  });

  return response.choices[0]?.message?.content || '';
}

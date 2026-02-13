import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * 전사 내용에서 핵심 주제를 추출하고,
 * 웹 검색을 통해 관련 이론/이슈/기술 정보를 수집합니다.
 */
export async function searchRelatedTopics(transcription: string): Promise<string> {
  // 전사 내용이 너무 길면 앞부분만 사용하여 키워드 추출
  const excerpt = transcription.length > 5000
    ? transcription.slice(0, 5000)
    : transcription;

  try {
    // OpenAI Responses API + web_search_preview 도구로 관련 정보 검색
    const response = await openai.responses.create({
      model: 'gpt-4o-mini',
      tools: [{ type: 'web_search_preview' as const }],
      input: [
        {
          role: 'system' as const,
          content: `당신은 리서치 전문가입니다. 주어진 대화/회의 내용을 분석하고, 웹 검색을 통해 관련된 이론, 최신 이슈, 기술 트렌드, 전문 용어 해설 등을 찾아주세요.

규칙:
- 대화 내용의 핵심 주제 3-5개를 파악합니다
- 각 주제에 대해 웹 검색을 수행합니다
- 관련된 학술 이론, 업계 트렌드, 기술 동향, 사례 등을 정리합니다
- 한국어로 작성합니다
- 출처 URL이 있으면 포함합니다

출력 형식:
## 관련 리서치

### [주제 1]
- 관련 이론/개념: ...
- 최신 동향: ...
- 참고: [출처]

### [주제 2]
...`,
        },
        {
          role: 'user' as const,
          content: `다음 대화 내용과 관련된 이론, 이슈, 기술 트렌드를 웹에서 검색해서 정리해주세요:\n\n${excerpt}`,
        },
      ],
    });

    // Responses API에서 텍스트 추출
    const outputText = response.output_text;
    if (outputText) {
      return outputText;
    }

    return '';
  } catch (err) {
    console.error('웹 검색 enrichment 실패:', err);
    // 실패해도 템플릿 생성은 계속 진행
    return '';
  }
}

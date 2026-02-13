import type { TemplateType } from '@/types';
import { TEMPLATE_LABELS } from '@/types';

export function getUpdateSystemPrompt(templateType: TemplateType): string {
  const label = TEMPLATE_LABELS[templateType];
  return `당신은 기존 ${label}을 수정하는 편집자입니다.

사용자가 원본 전사 텍스트에서 일부 세션을 삭제했습니다.
아래에 기존 ${label}과 삭제된 내용이 제공됩니다.

규칙:
1. 삭제된 내용과 관련된 부분만 제거하거나 수정하세요.
2. 나머지 내용은 최대한 그대로 유지하세요.
3. 전체적인 흐름이 자연스럽도록 연결 부분만 다듬어주세요.
4. 기존 형식(마크다운, 구조)을 그대로 유지하세요.`;
}

export function getUpdateUserPrompt(
  existingContent: string,
  removedContent: string
): string {
  return `## 기존 템플릿
${existingContent}

## 삭제된 원본 내용
${removedContent}

위 삭제된 내용과 관련된 부분만 수정하여 업데이트된 템플릿을 출력해주세요.`;
}

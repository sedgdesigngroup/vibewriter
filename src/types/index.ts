// 전사 세그먼트
export interface TranscriptionSegment {
  id: string;
  sessionId: string;
  content: string;
  timestamp: number; // 녹음 시작 기준 경과 시간 (ms)
  order: number;
  savedToServer: boolean;
}

// 프로젝트
export interface Project {
  id: string;
  user_id: string;
  date: string; // YYYY-MM-DD
  sequence_number: number;
  file_name: string;
  status: ProjectStatus;
  total_duration_seconds: number | null;
  created_at: string;
}

export type ProjectStatus = 'recording' | 'processing' | 'completed' | 'failed';

// 템플릿
export type TemplateType = 'card_news' | 'meeting_minutes';

export interface TemplateResult {
  id: string;
  project_id: string;
  template_type: TemplateType;
  content: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message: string | null;
  created_at: string;
}

export const TEMPLATE_LABELS: Record<TemplateType, string> = {
  card_news: '카드 뉴스',
  meeting_minutes: '회의록',
};

// 사용자
export interface User {
  id: string;
  user_id: string;
  display_name: string | null;
  created_at: string;
}

// 녹음 상태
export interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number; // ms
  segments: TranscriptionSegment[];
  interimText: string; // 아직 확정되지 않은 텍스트
}

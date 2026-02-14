// 전사 세그먼트
export interface TranscriptionSegment {
  id: string;
  sessionId: string;
  content: string;
  timestamp: number; // 녹음 시작 기준 경과 시간 (ms)
  order: number;
  savedToServer: boolean;
  speechSessionId?: string; // 소속 세션 ID (침묵 기준 분리 단위)
  clockTime?: number;       // 실제 시각 (Date.now())
  source?: 'webSpeech' | 'whisper'; // 어떤 엔진이 생성했는지
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

// ─── 하루종일 녹음 모드 타입 ───

// 세션: 침묵 1분 기준 자동 분리되는 연속 발화 단위
export interface SpeechSession {
  id: string;
  sessionGroupId: string;
  startTime: number;     // 실제 시각 (Date.now())
  endTime: number | null;
  segments: TranscriptionSegment[];
  order: number;
}

// 세션그룹: 녹음 on/off 한 사이클
export interface SessionGroup {
  id: string;
  allDaySessionId: string;
  startTime: number;
  endTime: number | null;
  sessions: SpeechSession[];
  order: number;
}

// 하루종일 녹음
export interface AllDaySession {
  id: string;
  startDate: string;     // YYYY-MM-DD
  startTime: number;
  endTime: number | null;
  status: 'active' | 'completed';
  sessionGroups: SessionGroup[];
  gaps: BackgroundGap[];
}

// 백그라운드 중단 기록
export interface BackgroundGap {
  startTime: number;
  endTime: number;
}

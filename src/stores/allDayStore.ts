import { create } from 'zustand';
import type {
  AllDaySession,
  SessionGroup,
  SpeechSession,
  TranscriptionSegment,
  BackgroundGap,
} from '@/types';

interface AllDayStore {
  // 상태
  allDaySession: AllDaySession | null;
  currentSessionGroup: SessionGroup | null;
  currentSession: SpeechSession | null;
  lastSpeechTime: number | null;
  interimText: string;
  isRecording: boolean; // 세션그룹 녹음 중 여부

  // 하루종일 세션 관리
  startAllDay: () => void;
  stopAllDay: () => AllDaySession | null;

  // 세션그룹 관리 (녹음 on/off)
  startSessionGroup: () => void;
  stopSessionGroup: () => void;

  // 세션 관리 (침묵 기반 자동 분리)
  addSegment: (content: string, source?: 'webSpeech' | 'whisper') => void;
  finalizeSession: () => void;

  // Whisper 재전사 시 세션그룹 세그먼트 교체
  replaceCurrentGroupSegments: (newSegments: TranscriptionSegment[]) => void;

  // 백그라운드 처리
  onBackgrounded: () => void;
  onForegrounded: () => void;

  // 기타
  setInterimText: (text: string) => void;
  recoverSession: (session: AllDaySession) => void;
  reset: () => void;
}

let segmentOrder = 0;
let sessionOrder = 0;
let groupOrder = 0;

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function getTodayDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export const useAllDayStore = create<AllDayStore>((set, get) => ({
  allDaySession: null,
  currentSessionGroup: null,
  currentSession: null,
  lastSpeechTime: null,
  interimText: '',
  isRecording: false,

  startAllDay: () => {
    segmentOrder = 0;
    sessionOrder = 0;
    groupOrder = 0;

    const session: AllDaySession = {
      id: generateId('allday'),
      startDate: getTodayDate(),
      startTime: Date.now(),
      endTime: null,
      status: 'active',
      sessionGroups: [],
      gaps: [],
    };

    set({ allDaySession: session });
  },

  stopAllDay: () => {
    const state = get();
    // 현재 세션그룹이 있으면 종료
    if (state.currentSessionGroup) {
      state.stopSessionGroup();
    }

    const updatedState = get();
    const finalSession = updatedState.allDaySession
      ? {
          ...updatedState.allDaySession,
          endTime: Date.now(),
          status: 'completed' as const,
        }
      : null;

    set({
      allDaySession: finalSession,
      isRecording: false,
    });

    return finalSession;
  },

  startSessionGroup: () => {
    const state = get();
    if (!state.allDaySession) return;

    const group: SessionGroup = {
      id: generateId('group'),
      allDaySessionId: state.allDaySession.id,
      startTime: Date.now(),
      endTime: null,
      sessions: [],
      order: groupOrder++,
    };

    set({
      currentSessionGroup: group,
      currentSession: null,
      lastSpeechTime: null,
      isRecording: true,
    });
  },

  stopSessionGroup: () => {
    const state = get();
    if (!state.allDaySession || !state.currentSessionGroup) return;

    // 현재 세션 마무리
    let finalSession = state.currentSession;
    if (finalSession && finalSession.segments.length > 0) {
      finalSession = { ...finalSession, endTime: Date.now() };
    } else {
      finalSession = null;
    }

    // 세션그룹에 현재 세션 포함
    const finalGroup: SessionGroup = {
      ...state.currentSessionGroup,
      endTime: Date.now(),
      sessions: finalSession
        ? [...state.currentSessionGroup.sessions, finalSession]
        : state.currentSessionGroup.sessions,
    };

    // allDaySession에 세션그룹 추가
    const updatedAllDay: AllDaySession = {
      ...state.allDaySession,
      sessionGroups: [...state.allDaySession.sessionGroups, finalGroup],
    };

    set({
      allDaySession: updatedAllDay,
      currentSessionGroup: null,
      currentSession: null,
      lastSpeechTime: null,
      interimText: '',
      isRecording: false,
    });
  },

  addSegment: (content: string, source?: 'webSpeech' | 'whisper') => {
    const state = get();
    if (!state.allDaySession || !state.currentSessionGroup) return;

    const now = Date.now();

    // 현재 세션이 없으면 새 세션 시작
    let session = state.currentSession;
    if (!session) {
      session = {
        id: generateId('session'),
        sessionGroupId: state.currentSessionGroup.id,
        startTime: now,
        endTime: null,
        segments: [],
        order: sessionOrder++,
      };
    }

    const segment: TranscriptionSegment = {
      id: generateId('seg'),
      sessionId: state.allDaySession.id,
      content,
      timestamp: now - state.allDaySession.startTime,
      order: segmentOrder++,
      savedToServer: false,
      speechSessionId: session.id,
      clockTime: now,
      source: source || 'webSpeech',
    };

    const updatedSession: SpeechSession = {
      ...session,
      segments: [...session.segments, segment],
    };

    set({
      currentSession: updatedSession,
      lastSpeechTime: now,
      interimText: '',
    });
  },

  finalizeSession: () => {
    const state = get();
    if (!state.currentSession || !state.currentSessionGroup) return;
    if (state.currentSession.segments.length === 0) {
      set({ currentSession: null });
      return;
    }

    const finalizedSession: SpeechSession = {
      ...state.currentSession,
      endTime: Date.now(),
    };

    const updatedGroup: SessionGroup = {
      ...state.currentSessionGroup,
      sessions: [...state.currentSessionGroup.sessions, finalizedSession],
    };

    set({
      currentSessionGroup: updatedGroup,
      currentSession: null,
    });
  },

  replaceCurrentGroupSegments: (newSegments: TranscriptionSegment[]) => {
    const state = get();
    if (!state.allDaySession) return;

    // 가장 최근에 완료된 세션그룹의 세그먼트를 교체
    const groups = [...state.allDaySession.sessionGroups];
    if (groups.length === 0) return;

    const lastGroup = groups[groups.length - 1];

    // 새 세그먼트를 단일 세션에 넣어서 교체
    const replacementSession: SpeechSession = {
      id: generateId('session'),
      sessionGroupId: lastGroup.id,
      startTime: lastGroup.startTime,
      endTime: lastGroup.endTime,
      segments: newSegments,
      order: 0,
    };

    groups[groups.length - 1] = {
      ...lastGroup,
      sessions: [replacementSession],
    };

    set({
      allDaySession: {
        ...state.allDaySession,
        sessionGroups: groups,
      },
    });
  },

  onBackgrounded: () => {
    const state = get();
    if (!state.allDaySession) return;

    const gap: BackgroundGap = {
      startTime: Date.now(),
      endTime: 0, // 복귀 시 업데이트
    };

    set({
      allDaySession: {
        ...state.allDaySession,
        gaps: [...state.allDaySession.gaps, gap],
      },
    });
  },

  onForegrounded: () => {
    const state = get();
    if (!state.allDaySession) return;

    const gaps = [...state.allDaySession.gaps];
    const lastGap = gaps[gaps.length - 1];
    if (lastGap && lastGap.endTime === 0) {
      gaps[gaps.length - 1] = { ...lastGap, endTime: Date.now() };
    }

    set({
      allDaySession: {
        ...state.allDaySession,
        gaps,
      },
    });
  },

  setInterimText: (text: string) => set({ interimText: text }),

  recoverSession: (session: AllDaySession) => {
    // 기존 세션 복구 시 카운터 복원
    let maxSegOrder = 0;
    let maxSessOrder = 0;
    let maxGroupOrder = 0;

    for (const group of session.sessionGroups) {
      if (group.order >= maxGroupOrder) maxGroupOrder = group.order + 1;
      for (const sess of group.sessions) {
        if (sess.order >= maxSessOrder) maxSessOrder = sess.order + 1;
        for (const seg of sess.segments) {
          if (seg.order >= maxSegOrder) maxSegOrder = seg.order + 1;
        }
      }
    }

    segmentOrder = maxSegOrder;
    sessionOrder = maxSessOrder;
    groupOrder = maxGroupOrder;

    set({
      allDaySession: { ...session, status: 'active' },
      currentSessionGroup: null,
      currentSession: null,
      lastSpeechTime: null,
      interimText: '',
      isRecording: false,
    });
  },

  reset: () => {
    segmentOrder = 0;
    sessionOrder = 0;
    groupOrder = 0;
    set({
      allDaySession: null,
      currentSessionGroup: null,
      currentSession: null,
      lastSpeechTime: null,
      interimText: '',
      isRecording: false,
    });
  },
}));

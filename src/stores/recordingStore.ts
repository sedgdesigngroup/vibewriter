import { create } from 'zustand';
import type { TranscriptionSegment } from '@/types';

interface RecordingStore {
  isRecording: boolean;
  isPaused: boolean;
  duration: number; // ms
  startTime: number | null;
  segments: TranscriptionSegment[];
  interimText: string;
  sessionId: string | null;

  startRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopRecording: () => void;
  addSegment: (content: string) => void;
  setInterimText: (text: string) => void;
  setDuration: (duration: number) => void;
  reset: () => void;
}

let segmentOrder = 0;

export const useRecordingStore = create<RecordingStore>((set, get) => ({
  isRecording: false,
  isPaused: false,
  duration: 0,
  startTime: null,
  segments: [],
  interimText: '',
  sessionId: null,

  startRecording: () => {
    segmentOrder = 0;
    set({
      isRecording: true,
      isPaused: false,
      duration: 0,
      startTime: Date.now(),
      segments: [],
      interimText: '',
      sessionId: `session_${Date.now()}`,
    });
  },

  pauseRecording: () => set({ isPaused: true }),

  resumeRecording: () => set({ isPaused: false }),

  stopRecording: () => set({ isRecording: false, isPaused: false }),

  addSegment: (content: string) => {
    const state = get();
    if (!state.sessionId || !state.startTime) return;

    const segment: TranscriptionSegment = {
      id: `seg_${Date.now()}_${segmentOrder}`,
      sessionId: state.sessionId,
      content,
      timestamp: Date.now() - state.startTime,
      order: segmentOrder++,
      savedToServer: false,
    };

    set((s) => ({ segments: [...s.segments, segment] }));
  },

  setInterimText: (text: string) => set({ interimText: text }),

  setDuration: (duration: number) => set({ duration }),

  reset: () => {
    segmentOrder = 0;
    set({
      isRecording: false,
      isPaused: false,
      duration: 0,
      startTime: null,
      segments: [],
      interimText: '',
      sessionId: null,
    });
  },
}));

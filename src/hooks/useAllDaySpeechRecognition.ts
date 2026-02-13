"use client";

import { useEffect, useRef, useCallback } from 'react';
import { useAllDayStore } from '@/stores/allDayStore';

// Web Speech API 타입 선언
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: Event & { error: string }) => void) | null;
  onstart: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
  }
}

const SILENCE_TIMEOUT_MS = 60000; // 1분 침묵 → 세션 종료
const SILENCE_CHECK_INTERVAL_MS = 5000; // 5초마다 침묵 체크

export function useAllDaySpeechRecognition() {
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const shouldRestartRef = useRef(false);
  const silenceCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const {
    isRecording,
    lastSpeechTime,
    currentSession,
    addSegment,
    setInterimText,
    finalizeSession,
  } = useAllDayStore();

  const isRecordingRef = useRef(isRecording);
  const lastSpeechTimeRef = useRef(lastSpeechTime);
  const currentSessionRef = useRef(currentSession);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    lastSpeechTimeRef.current = lastSpeechTime;
  }, [lastSpeechTime]);

  useEffect(() => {
    currentSessionRef.current = currentSession;
  }, [currentSession]);

  // 침묵 체크 타이머
  const startSilenceCheck = useCallback(() => {
    if (silenceCheckRef.current) clearInterval(silenceCheckRef.current);

    silenceCheckRef.current = setInterval(() => {
      const lastTime = lastSpeechTimeRef.current;
      const session = currentSessionRef.current;

      if (lastTime && session && session.segments.length > 0) {
        const silenceDuration = Date.now() - lastTime;
        if (silenceDuration >= SILENCE_TIMEOUT_MS) {
          finalizeSession();
        }
      }
    }, SILENCE_CHECK_INTERVAL_MS);
  }, [finalizeSession]);

  const stopSilenceCheck = useCallback(() => {
    if (silenceCheckRef.current) {
      clearInterval(silenceCheckRef.current);
      silenceCheckRef.current = null;
    }
  }, []);

  const startRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('이 브라우저는 음성 인식을 지원하지 않습니다. Chrome 또는 Safari를 사용해주세요.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'ko-KR';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const text = result[0].transcript.trim();
          if (text) {
            addSegment(text);
          }
          setInterimText('');
        } else {
          interim += result[0].transcript;
        }
      }

      if (interim) {
        setInterimText(interim);
      }
    };

    recognition.onend = () => {
      // 녹음 중이면 자동 재시작
      if (isRecordingRef.current && shouldRestartRef.current) {
        try {
          setTimeout(() => {
            if (isRecordingRef.current && shouldRestartRef.current) {
              recognition.start();
            }
          }, 100);
        } catch {
          // 재시작 실패 시 무시
        }
      }
    };

    recognition.onerror = (event: Event & { error: string }) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        console.error('Speech recognition error:', event.error);
      }
    };

    recognitionRef.current = recognition;
    shouldRestartRef.current = true;

    try {
      recognition.start();
    } catch {
      // 이미 시작된 경우
    }

    startSilenceCheck();
  }, [addSegment, setInterimText, startSilenceCheck]);

  const stopRecognition = useCallback(() => {
    shouldRestartRef.current = false;
    stopSilenceCheck();
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // 이미 중지된 경우
      }
      recognitionRef.current = null;
    }
  }, [stopSilenceCheck]);

  // 포그라운드 복귀 시 강제 재시작
  const forceRestart = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // 무시
      }
      recognitionRef.current = null;
    }
    startRecognition();
  }, [startRecognition]);

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      shouldRestartRef.current = false;
      stopSilenceCheck();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // 무시
        }
      }
    };
  }, [stopSilenceCheck]);

  return {
    startRecognition,
    stopRecognition,
    forceRestart,
    isSupported: typeof window !== 'undefined' &&
      !!(window.SpeechRecognition || window.webkitSpeechRecognition),
  };
}

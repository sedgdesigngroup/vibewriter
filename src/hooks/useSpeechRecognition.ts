"use client";

import { useEffect, useRef, useCallback } from 'react';
import { useRecordingStore } from '@/stores/recordingStore';

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

export function useSpeechRecognition() {
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const shouldRestartRef = useRef(false);
  const {
    isRecording,
    isPaused,
    addSegment,
    setInterimText,
  } = useRecordingStore();

  const isRecordingRef = useRef(isRecording);
  const isPausedRef = useRef(isPaused);

  useEffect(() => {
    isRecordingRef.current = isRecording;
    isPausedRef.current = isPaused;
  }, [isRecording, isPaused]);

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
      // 사용자가 정지하지 않았다면 자동 재시작
      if (isRecordingRef.current && !isPausedRef.current && shouldRestartRef.current) {
        try {
          setTimeout(() => {
            if (isRecordingRef.current && !isPausedRef.current) {
              recognition.start();
            }
          }, 100);
        } catch {
          // 재시작 실패 시 무시
        }
      }
    };

    recognition.onerror = (event: Event & { error: string }) => {
      // 'no-speech'는 정상 - 침묵 시 발생, 자동 재시작됨
      // 'aborted'는 pause/stop 시 발생
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
  }, [addSegment, setInterimText]);

  const stopRecognition = useCallback(() => {
    shouldRestartRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // 이미 중지된 경우
      }
      recognitionRef.current = null;
    }
  }, []);

  const pauseRecognition = useCallback(() => {
    shouldRestartRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // 이미 중지된 경우
      }
    }
  }, []);

  const resumeRecognition = useCallback(() => {
    shouldRestartRef.current = true;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch {
        // 시작 실패 시 새로 생성
        startRecognition();
      }
    } else {
      startRecognition();
    }
  }, [startRecognition]);

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      shouldRestartRef.current = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // 무시
        }
      }
    };
  }, []);

  return {
    startRecognition,
    stopRecognition,
    pauseRecognition,
    resumeRecognition,
    isSupported: typeof window !== 'undefined' &&
      !!(window.SpeechRecognition || window.webkitSpeechRecognition),
  };
}

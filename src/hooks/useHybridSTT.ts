"use client";

import { useRef, useState, useCallback, useEffect } from 'react';

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

export type STTMode = 'webSpeech' | 'whisper';

interface UseHybridSTTOptions {
  addSegment: (content: string, source?: 'webSpeech' | 'whisper') => void;
  setInterimText: (text: string) => void;
  // Whisper 폴백 전환 시 호출 — 밀린 시간(초)을 전달하여 해당 구간 오디오를 Whisper로 보낼 수 있음
  onFallbackActivated?: (missedSeconds: number) => void;
}

const WEB_SPEECH_SILENCE_THRESHOLD_MS = 10 * 60 * 1000; // 10분
const HEALTH_CHECK_INTERVAL_MS = 15 * 1000; // 15초마다 체크
const WHISPER_CHUNK_DURATION_MS = 30 * 1000; // 30초 청크
const TRANSITION_OVERLAP_MS = 5 * 1000; // 복귀 시 5초 오버랩

export function useHybridSTT(options: UseHybridSTTOptions) {
  const { addSegment, setInterimText, onFallbackActivated } = options;

  // -- 상태 머신 --
  const modeRef = useRef<STTMode>('webSpeech');
  const [mode, setMode] = useState<STTMode>('webSpeech');

  // -- Web Speech refs --
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const shouldRestartRef = useRef(false);
  const lastWebSpeechResultRef = useRef<number>(Date.now());
  const healthCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // -- Whisper 폴백 refs --
  const fallbackRecorderRef = useRef<MediaRecorder | null>(null);
  const fallbackStreamRef = useRef<MediaStream | null>(null);
  const currentChunkRef = useRef<Blob[]>([]);
  const chunkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingRequestsRef = useRef<number>(0);
  const consecutiveFailuresRef = useRef<number>(0);
  const isActiveRef = useRef(false);

  // -- 콜백 안정 ref --
  const addSegmentRef = useRef(addSegment);
  const setInterimTextRef = useRef(setInterimText);
  const onFallbackActivatedRef = useRef(onFallbackActivated);
  useEffect(() => { addSegmentRef.current = addSegment; }, [addSegment]);
  useEffect(() => { setInterimTextRef.current = setInterimText; }, [setInterimText]);
  useEffect(() => { onFallbackActivatedRef.current = onFallbackActivated; }, [onFallbackActivated]);

  // ============================================================
  // Whisper 폴백 함수들
  // ============================================================

  const flushChunkToWhisper = useCallback(async () => {
    if (currentChunkRef.current.length === 0) return;

    // 청크를 로컬로 복사하고 ref는 즉시 초기화 (메모리 해제)
    const chunksToSend = [...currentChunkRef.current];
    currentChunkRef.current = [];

    const audioBlob = new Blob(chunksToSend, { type: 'audio/webm' });

    if (audioBlob.size === 0) return;

    pendingRequestsRef.current++;
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, `chunk_${Date.now()}.webm`);

      const res = await fetch('/api/whisper', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const result = await res.json();
        consecutiveFailuresRef.current = 0;

        // Whisper segments 각각을 addSegment로 전달
        if (result.segments && result.segments.length > 0) {
          for (const seg of result.segments) {
            const text = (seg.text || '').trim();
            if (text) {
              addSegmentRef.current(text, 'whisper');
            }
          }
        } else if (result.text && result.text.trim()) {
          addSegmentRef.current(result.text.trim(), 'whisper');
        }
      } else {
        consecutiveFailuresRef.current++;
        console.error('Whisper 폴백 전사 실패:', res.status);
      }
    } catch (err) {
      consecutiveFailuresRef.current++;
      console.error('Whisper 폴백 요청 오류:', err);
    } finally {
      pendingRequestsRef.current--;
    }
    // audioBlob, chunksToSend는 여기서 스코프를 벗어나 GC 대상
  }, []);

  const startWhisperFallback = useCallback(async () => {
    try {
      // 마이크 스트림 획득
      if (!fallbackStreamRef.current) {
        fallbackStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      const recorder = new MediaRecorder(fallbackStreamRef.current, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      });

      currentChunkRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          currentChunkRef.current.push(e.data);
        }
      };

      fallbackRecorderRef.current = recorder;
      recorder.start(1000); // 1초마다 서브 청크 수집

      // 30초마다 Whisper로 플러시
      chunkTimerRef.current = setInterval(() => {
        flushChunkToWhisper();
      }, WHISPER_CHUNK_DURATION_MS);

      consecutiveFailuresRef.current = 0;
    } catch (err) {
      console.error('Whisper 폴백 녹음 시작 실패:', err);
    }
  }, [flushChunkToWhisper]);

  const stopWhisperFallback = useCallback(() => {
    // 타이머 정리
    if (chunkTimerRef.current) {
      clearInterval(chunkTimerRef.current);
      chunkTimerRef.current = null;
    }

    // 레코더 정리
    if (fallbackRecorderRef.current && fallbackRecorderRef.current.state !== 'inactive') {
      fallbackRecorderRef.current.stop();
    }
    fallbackRecorderRef.current = null;

    // 스트림 정리
    if (fallbackStreamRef.current) {
      fallbackStreamRef.current.getTracks().forEach(track => track.stop());
      fallbackStreamRef.current = null;
    }

    // 잔여 청크 정리
    currentChunkRef.current = [];
  }, []);

  // ============================================================
  // 상태 전환 함수들
  // ============================================================

  const transitionToWhisper = useCallback(() => {
    if (modeRef.current === 'whisper') return;

    const missedMs = Date.now() - lastWebSpeechResultRef.current;
    const missedSeconds = Math.round(missedMs / 1000);

    console.log(`[HybridSTT] Web Speech ${missedSeconds}초 무응답 → Whisper 폴백 전환`);
    modeRef.current = 'whisper';
    setMode('whisper');

    // 밀린 구간 오디오를 Whisper로 보내도록 부모에게 알림
    if (onFallbackActivatedRef.current) {
      onFallbackActivatedRef.current(missedSeconds);
    }

    // 이후 실시간 Whisper 폴백 녹음 시작
    startWhisperFallback();
  }, [startWhisperFallback]);

  const transitionBackToWebSpeech = useCallback(() => {
    if (modeRef.current === 'webSpeech') return;

    console.log('[HybridSTT] Web Speech 복귀 감지 → webSpeech 모드로 전환');

    modeRef.current = 'webSpeech';
    setMode('webSpeech');
    lastWebSpeechResultRef.current = Date.now();

    // 5초 오버랩 후 폴백 녹음 중지 (빈틈 방지)
    setTimeout(async () => {
      await flushChunkToWhisper(); // 남은 청크 플러시
      stopWhisperFallback();
    }, TRANSITION_OVERLAP_MS);
  }, [flushChunkToWhisper, stopWhisperFallback]);

  // ============================================================
  // Web Speech API
  // ============================================================

  const startWebSpeech = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'ko-KR';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let hasFinalResult = false;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          hasFinalResult = true;
          const text = result[0].transcript.trim();
          if (text) {
            addSegmentRef.current(text, 'webSpeech');
          }
          setInterimTextRef.current('');
        } else {
          interim += result[0].transcript;
        }
      }

      if (interim) {
        setInterimTextRef.current(interim);
      }

      // 타임스탬프 갱신 (interim 포함)
      lastWebSpeechResultRef.current = Date.now();

      // Whisper 모드에서 Web Speech isFinal 결과 수신 → 복귀
      if (hasFinalResult && modeRef.current === 'whisper') {
        transitionBackToWebSpeech();
      }
    };

    recognition.onend = () => {
      // 활성 상태면 자동 재시작
      if (isActiveRef.current && shouldRestartRef.current) {
        try {
          setTimeout(() => {
            if (isActiveRef.current && shouldRestartRef.current) {
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
        console.error('[HybridSTT] Speech recognition error:', event.error);
      }
    };

    recognitionRef.current = recognition;
    shouldRestartRef.current = true;

    try {
      recognition.start();
    } catch {
      // 이미 시작된 경우
    }
  }, [transitionBackToWebSpeech]);

  const stopWebSpeech = useCallback(() => {
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

  // ============================================================
  // Health Check (10분 무응답 감지)
  // ============================================================

  const startHealthCheck = useCallback(() => {
    if (healthCheckRef.current) clearInterval(healthCheckRef.current);

    healthCheckRef.current = setInterval(() => {
      if (!isActiveRef.current) return;

      const silenceDuration = Date.now() - lastWebSpeechResultRef.current;
      if (silenceDuration >= WEB_SPEECH_SILENCE_THRESHOLD_MS && modeRef.current === 'webSpeech') {
        transitionToWhisper();
      }
    }, HEALTH_CHECK_INTERVAL_MS);
  }, [transitionToWhisper]);

  const stopHealthCheck = useCallback(() => {
    if (healthCheckRef.current) {
      clearInterval(healthCheckRef.current);
      healthCheckRef.current = null;
    }
  }, []);

  // ============================================================
  // Public API
  // ============================================================

  const start = useCallback(() => {
    isActiveRef.current = true;
    lastWebSpeechResultRef.current = Date.now();
    modeRef.current = 'webSpeech';
    setMode('webSpeech');
    startWebSpeech();
    startHealthCheck();
  }, [startWebSpeech, startHealthCheck]);

  const stop = useCallback(async () => {
    isActiveRef.current = false;
    shouldRestartRef.current = false;
    stopHealthCheck();
    stopWebSpeech();

    // Whisper 폴백 중이면 남은 청크 플러시 후 정리
    if (modeRef.current === 'whisper') {
      await flushChunkToWhisper();
      stopWhisperFallback();
    }

    modeRef.current = 'webSpeech';
    setMode('webSpeech');
  }, [stopHealthCheck, stopWebSpeech, flushChunkToWhisper, stopWhisperFallback]);

  const forceRestart = useCallback(() => {
    stopWebSpeech();
    stopWhisperFallback();

    modeRef.current = 'webSpeech';
    setMode('webSpeech');
    lastWebSpeechResultRef.current = Date.now();

    if (isActiveRef.current) {
      startWebSpeech();
      startHealthCheck();
    }
  }, [stopWebSpeech, stopWhisperFallback, startWebSpeech, startHealthCheck]);

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      isActiveRef.current = false;
      shouldRestartRef.current = false;
      stopHealthCheck();
      stopWebSpeech();
      stopWhisperFallback();
    };
  }, [stopHealthCheck, stopWebSpeech, stopWhisperFallback]);

  return {
    start,
    stop,
    forceRestart,
    mode,
    isSupported: typeof window !== 'undefined' &&
      !!(window.SpeechRecognition || window.webkitSpeechRecognition),
  };
}

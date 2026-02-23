"use client";

import { useRef, useCallback, useEffect } from 'react';

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

interface UseHybridSTTOptions {
  addSegment: (content: string, source?: 'webSpeech' | 'whisper') => void;
  setInterimText: (text: string) => void;
}

const WHISPER_CHUNK_DURATION_MS = 10 * 1000; // 10초 청크
const WHISPER_MIN_CHUNK_SIZE = 1000; // 최소 1KB (무음 스킵)
const WHISPER_MAX_CHUNK_BYTES = 10 * 1024 * 1024; // 누적 상한 10MB

export function useHybridSTT(options: UseHybridSTTOptions) {
  const { addSegment, setInterimText } = options;

  // -- refs --
  const isActiveRef = useRef(false);

  // -- Web Speech refs --
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const shouldRestartRef = useRef(false);

  // -- Whisper 청크 refs --
  const whisperRecorderRef = useRef<MediaRecorder | null>(null);
  const whisperStreamRef = useRef<MediaStream | null>(null);
  const currentChunkRef = useRef<Blob[]>([]);
  const chunkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const externalStreamUsedRef = useRef(false);
  const isFlushingRef = useRef(false);

  // -- 콜백 안정 ref --
  const addSegmentRef = useRef(addSegment);
  const setInterimTextRef = useRef(setInterimText);
  useEffect(() => { addSegmentRef.current = addSegment; }, [addSegment]);
  useEffect(() => { setInterimTextRef.current = setInterimText; }, [setInterimText]);

  // ============================================================
  // Whisper 10초 청크 파이프라인
  // ============================================================

  // 실패 시 청크 복원 (상한 초과 시 오래된 청크 드롭)
  const restoreChunks = (failed: Blob[]) => {
    const merged = [...failed, ...currentChunkRef.current];
    let totalSize = 0;
    const kept: Blob[] = [];
    // 최신 청크부터 유지 (뒤에서부터)
    for (let i = merged.length - 1; i >= 0; i--) {
      totalSize += merged[i].size;
      if (totalSize > WHISPER_MAX_CHUNK_BYTES) break;
      kept.unshift(merged[i]);
    }
    currentChunkRef.current = kept;
  };

  const flushChunkToWhisper = useCallback(async () => {
    if (isFlushingRef.current) return; // 이전 요청 진행 중이면 스킵 (청크는 계속 누적됨)
    if (currentChunkRef.current.length === 0) return;

    const chunksToSend = [...currentChunkRef.current];
    currentChunkRef.current = [];

    const audioBlob = new Blob(chunksToSend, { type: 'audio/webm' });

    if (audioBlob.size < WHISPER_MIN_CHUNK_SIZE) return;

    isFlushingRef.current = true;
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, `chunk_${Date.now()}.webm`);

      const res = await fetch('/api/whisper', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const result = await res.json();

        if (result.segments && result.segments.length > 0) {
          for (const seg of result.segments) {
            const text = (seg.text || '').trim();
            if (text) {
              addSegmentRef.current(text, 'whisper');
            }
          }
          setInterimTextRef.current('');
        } else if (result.text && result.text.trim()) {
          addSegmentRef.current(result.text.trim(), 'whisper');
          setInterimTextRef.current('');
        }
      } else {
        console.error('[HybridSTT] Whisper 청크 전사 실패:', res.status);
        restoreChunks(chunksToSend);
      }
    } catch (err) {
      console.error('[HybridSTT] Whisper 청크 요청 오류:', err);
      restoreChunks(chunksToSend);
    } finally {
      isFlushingRef.current = false;
    }
  }, []);

  const startWhisperChunking = useCallback(async (externalStream?: MediaStream) => {
    try {
      let stream: MediaStream;
      if (externalStream) {
        stream = externalStream;
        externalStreamUsedRef.current = true;
      } else {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        externalStreamUsedRef.current = false;
      }
      whisperStreamRef.current = stream;

      const recorder = new MediaRecorder(stream, {
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

      whisperRecorderRef.current = recorder;
      recorder.start(1000); // 1초 서브청크

      // 10초마다 Whisper로 플러시
      chunkTimerRef.current = setInterval(() => {
        flushChunkToWhisper();
      }, WHISPER_CHUNK_DURATION_MS);
    } catch (err) {
      console.error('[HybridSTT] Whisper 청크 녹음 시작 실패:', err);
    }
  }, [flushChunkToWhisper]);

  const stopWhisperChunking = useCallback(() => {
    if (chunkTimerRef.current) {
      clearInterval(chunkTimerRef.current);
      chunkTimerRef.current = null;
    }

    if (whisperRecorderRef.current && whisperRecorderRef.current.state !== 'inactive') {
      whisperRecorderRef.current.stop();
    }
    whisperRecorderRef.current = null;

    // 외부 스트림이면 여기서 정리하지 않음 (호출측이 관리)
    if (whisperStreamRef.current && !externalStreamUsedRef.current) {
      whisperStreamRef.current.getTracks().forEach(track => track.stop());
    }
    whisperStreamRef.current = null;

    currentChunkRef.current = [];
  }, []);

  // ============================================================
  // Web Speech API (interimText 전용)
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

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          // interimText로만 표시 (addSegment 호출하지 않음)
          const text = result[0].transcript.trim();
          if (text) {
            setInterimTextRef.current(text);
          }
        } else {
          interim += result[0].transcript;
        }
      }

      if (interim) {
        setInterimTextRef.current(interim);
      }
    };

    recognition.onend = () => {
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
  }, []);

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
  // Public API
  // ============================================================

  const start = useCallback((externalStream?: MediaStream) => {
    isActiveRef.current = true;

    // 1. Web Speech 시작 (interimText 전용)
    startWebSpeech();

    // 2. Whisper 10초 청크 시작 (주력)
    startWhisperChunking(externalStream);
  }, [startWebSpeech, startWhisperChunking]);

  const stop = useCallback(async () => {
    isActiveRef.current = false;
    shouldRestartRef.current = false;

    stopWebSpeech();

    // 남은 청크 플러시 후 정리
    await flushChunkToWhisper();
    stopWhisperChunking();
  }, [stopWebSpeech, flushChunkToWhisper, stopWhisperChunking]);

  const forceRestart = useCallback((externalStream?: MediaStream) => {
    stopWebSpeech();
    stopWhisperChunking();

    if (isActiveRef.current) {
      startWebSpeech();
      startWhisperChunking(externalStream);
    }
  }, [stopWebSpeech, stopWhisperChunking, startWebSpeech, startWhisperChunking]);

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      isActiveRef.current = false;
      shouldRestartRef.current = false;
      stopWebSpeech();
      stopWhisperChunking();
    };
  }, [stopWebSpeech, stopWhisperChunking]);

  return {
    start,
    stop,
    forceRestart,
    flush: flushChunkToWhisper,
    isSupported: typeof window !== 'undefined' &&
      !!(window.SpeechRecognition || window.webkitSpeechRecognition),
  };
}

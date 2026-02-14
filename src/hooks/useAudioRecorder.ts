"use client";

import { useRef, useCallback } from 'react';

export function useAudioRecorder() {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const start = useCallback((stream: MediaStream) => {
    chunksRef.current = [];

    const recorder = new MediaRecorder(stream, {
      mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm',
    });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    recorderRef.current = recorder;
    recorder.start(1000); // 1초마다 청크 수집
  }, []);

  const pause = useCallback(() => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.pause();
    }
  }, []);

  const resume = useCallback(() => {
    if (recorderRef.current?.state === 'paused') {
      recorderRef.current.resume();
    }
  }, []);

  // 최근 N초의 오디오를 Blob으로 추출 (원본 청크는 유지)
  const getRecentBlob = useCallback((seconds: number): Blob => {
    const chunks = chunksRef.current;
    // 1초마다 청크이므로 seconds개만큼 뒤에서 자르기
    const startIdx = Math.max(0, chunks.length - seconds);
    const recentChunks = chunks.slice(startIdx);
    return new Blob(recentChunks, { type: 'audio/webm' });
  }, []);

  const stop = useCallback((): Promise<Blob> => {
    return new Promise((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        resolve(new Blob(chunksRef.current, { type: 'audio/webm' }));
        return;
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        chunksRef.current = [];
        recorderRef.current = null;
        resolve(blob);
      };

      recorder.stop();
    });
  }, []);

  return { start, pause, resume, stop, getRecentBlob };
}

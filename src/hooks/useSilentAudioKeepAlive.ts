"use client";

import { useRef, useCallback } from 'react';

/**
 * Silent Audio 재생으로 백그라운드 JS 실행을 연장하는 훅.
 * 브라우저가 "미디어 재생 중"으로 인식하여 안드로이드에서 효과적.
 * iOS에서는 제한적이나 비용이 거의 없으므로 적용.
 */
export function useSilentAudioKeepAlive() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  const start = useCallback(() => {
    if (audioRef.current) return; // 이미 재생 중

    try {
      // 프로그래밍 방식으로 무음 WAV 생성 (정적 파일 불필요)
      const sampleRate = 8000;
      const duration = 1; // 1초
      const numSamples = sampleRate * duration;
      const bytesPerSample = 2; // 16-bit
      const dataSize = numSamples * bytesPerSample;
      const headerSize = 44;
      const buffer = new ArrayBuffer(headerSize + dataSize);
      const view = new DataView(buffer);

      // WAV 헤더
      const writeString = (offset: number, str: string) => {
        for (let i = 0; i < str.length; i++) {
          view.setUint8(offset + i, str.charCodeAt(i));
        }
      };

      writeString(0, 'RIFF');
      view.setUint32(4, 36 + dataSize, true);
      writeString(8, 'WAVE');
      writeString(12, 'fmt ');
      view.setUint32(16, 16, true); // fmt chunk size
      view.setUint16(20, 1, true);  // PCM
      view.setUint16(22, 1, true);  // mono
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
      view.setUint16(32, bytesPerSample, true); // block align
      view.setUint16(34, 16, true); // bits per sample
      writeString(36, 'data');
      view.setUint32(40, dataSize, true);
      // 데이터 영역은 0 (무음)

      const blob = new Blob([buffer], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;

      const audio = new Audio(url);
      audio.loop = true;
      audio.volume = 0.01; // 거의 무음 (0이면 일부 브라우저가 최적화로 제거)
      audio.play().catch(() => {
        // 자동재생 차단 시 무시 (사용자 인터랙션 후 재시도)
      });
      audioRef.current = audio;
    } catch {
      // AudioContext 미지원 등
    }
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }, []);

  return { start, stop };
}

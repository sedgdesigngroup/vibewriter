"use client";

import { useEffect, useRef } from 'react';

interface UseBackgroundDetectionOptions {
  onBackgrounded: () => void;
  onForegrounded: (gapDurationMs: number) => void;
  enabled: boolean;
}

/**
 * Page Visibility API를 사용하여 앱의 포/백그라운드 전환을 감지하는 훅.
 */
export function useBackgroundDetection({
  onBackgrounded,
  onForegrounded,
  enabled,
}: UseBackgroundDetectionOptions) {
  const backgroundedAtRef = useRef<number | null>(null);
  const onBackgroundedRef = useRef(onBackgrounded);
  const onForegroundedRef = useRef(onForegrounded);

  useEffect(() => {
    onBackgroundedRef.current = onBackgrounded;
    onForegroundedRef.current = onForegrounded;
  }, [onBackgrounded, onForegrounded]);

  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        backgroundedAtRef.current = Date.now();
        onBackgroundedRef.current();
      } else if (document.visibilityState === 'visible') {
        const gap = backgroundedAtRef.current
          ? Date.now() - backgroundedAtRef.current
          : 0;
        backgroundedAtRef.current = null;
        onForegroundedRef.current(gap);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled]);
}

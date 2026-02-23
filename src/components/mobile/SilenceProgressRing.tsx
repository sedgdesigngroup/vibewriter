"use client";

import { useEffect, useState } from 'react';

interface SilenceProgressRingProps {
  lastSpeechTime: number | null;
  isRecording: boolean;
  silenceThresholdMs?: number;
}

const SILENCE_THRESHOLD_MS = 60 * 1000; // 60초

export default function SilenceProgressRing({
  lastSpeechTime,
  isRecording,
  silenceThresholdMs = SILENCE_THRESHOLD_MS,
}: SilenceProgressRingProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!isRecording || !lastSpeechTime) {
      setProgress(0);
      return;
    }

    const timer = setInterval(() => {
      const elapsed = Date.now() - lastSpeechTime;
      const p = Math.min(elapsed / silenceThresholdMs, 1);
      setProgress(p);
    }, 200);

    return () => clearInterval(timer);
  }, [isRecording, lastSpeechTime, silenceThresholdMs]);

  const remainingSeconds = lastSpeechTime
    ? Math.max(0, Math.ceil((silenceThresholdMs - (Date.now() - lastSpeechTime)) / 1000))
    : silenceThresholdMs / 1000;

  // SVG 원형 프로그레스
  const size = 140;
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  // 색상: 평소 subtle, 80% 넘으면 경고
  const ringColor = progress > 0.8
    ? 'rgba(251, 146, 60, 0.7)'  // orange
    : 'rgba(148, 163, 184, 0.2)'; // subtle gray

  const textColor = progress > 0.8
    ? 'text-orange-400'
    : 'text-slate-500';

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative">
        <svg
          width={size}
          height={size}
          className="transform -rotate-90"
        >
          {/* 배경 링 */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(148, 163, 184, 0.08)"
            strokeWidth={strokeWidth}
          />
          {/* 진행 링 */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={ringColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-200"
          />
        </svg>
        {/* 중앙 텍스트 */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {progress > 0.05 ? (
            <>
              <span className={`text-2xl font-light tabular-nums ${textColor}`}>
                {remainingSeconds}
              </span>
              <span className={`text-[10px] mt-0.5 ${textColor}`}>
                초 후 분리
              </span>
            </>
          ) : (
            <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
          )}
        </div>
      </div>
    </div>
  );
}

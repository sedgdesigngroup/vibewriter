"use client";

import { useEffect, useRef } from 'react';
import type { TranscriptionSegment } from '@/types';

interface TranscriptionMirrorProps {
  segments: TranscriptionSegment[];
  interimText: string;
}

export default function TranscriptionMirror({ segments, interimText }: TranscriptionMirrorProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [segments, interimText]);

  return (
    <div className="flex-1 overflow-y-auto bg-slate-800 rounded-lg p-4 space-y-2">
      {segments.length === 0 && !interimText && (
        <p className="text-slate-500 text-center text-sm">
          녹음을 시작하면 전사된 텍스트가 여기에 표시됩니다
        </p>
      )}

      {segments.map((seg) => (
        <div key={seg.id} className="text-slate-200 text-sm leading-relaxed">
          <span className="text-slate-400 text-xs mr-2">
            {formatTime(seg.timestamp)}
          </span>
          {seg.content}
        </div>
      ))}

      {interimText && (
        <div className="text-slate-400 text-sm italic leading-relaxed">
          <span className="text-slate-500 text-xs mr-2">...</span>
          {interimText}
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

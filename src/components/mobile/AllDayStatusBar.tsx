"use client";

interface AllDayStatusBarProps {
  isAllDayActive: boolean;
  isRecording: boolean;
  segmentCount: number;
  startTime: number | null;
  sttMode?: 'webSpeech' | 'whisper';
}

export default function AllDayStatusBar({
  isAllDayActive,
  isRecording,
  segmentCount,
  startTime,
  sttMode = 'webSpeech',
}: AllDayStatusBarProps) {
  if (!isAllDayActive) return null;

  const elapsed = startTime ? Date.now() - startTime : 0;

  return (
    <div className="flex items-center justify-center gap-3 py-2">
      {isRecording && (
        <span
          className={`w-1.5 h-1.5 rounded-full animate-pulse ${
            sttMode === 'whisper' ? 'bg-orange-400' : 'bg-emerald-400'
          }`}
        />
      )}
      <span className="text-slate-500 text-[11px] tabular-nums">
        {formatElapsed(elapsed)}
      </span>
      {segmentCount > 0 && (
        <span className="text-slate-600 text-[11px]">
          {segmentCount}건
        </span>
      )}
    </div>
  );
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

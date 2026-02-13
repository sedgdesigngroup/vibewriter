"use client";

interface AllDayStatusBarProps {
  isAllDayActive: boolean;
  isRecording: boolean;
  sessionGroupCount: number;
  sessionCount: number;
  segmentCount: number;
  startTime: number | null;
}

export default function AllDayStatusBar({
  isAllDayActive,
  isRecording,
  sessionGroupCount,
  sessionCount,
  segmentCount,
  startTime,
}: AllDayStatusBarProps) {
  if (!isAllDayActive) return null;

  const elapsed = startTime ? Date.now() - startTime : 0;
  const statusText = isRecording ? '녹음 중' : '대기 중';
  const statusColor = isRecording ? 'bg-green-500' : 'bg-yellow-500';

  return (
    <div className="flex items-center justify-between bg-slate-800 rounded-lg px-4 py-2 mb-3">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${statusColor} ${isRecording ? 'animate-pulse' : ''}`} />
        <span className="text-slate-300 text-xs">{statusText}</span>
      </div>
      <div className="flex items-center gap-3 text-slate-400 text-xs">
        <span>{sessionGroupCount}그룹</span>
        <span>{sessionCount}세션</span>
        <span>{segmentCount}건</span>
        {startTime && (
          <span className="text-slate-500">{formatElapsed(elapsed)}</span>
        )}
      </div>
    </div>
  );
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}시간 ${minutes}분`;
  return `${minutes}분`;
}

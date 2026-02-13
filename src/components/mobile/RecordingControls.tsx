"use client";

interface RecordingControlsProps {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

export default function RecordingControls({
  isRecording,
  isPaused,
  duration,
  onStart,
  onPause,
  onResume,
  onStop,
}: RecordingControlsProps) {
  return (
    <div className="flex flex-col items-center gap-4">
      {/* 녹음 시간 표시 */}
      <div className="text-3xl font-mono text-white tabular-nums">
        {formatDuration(duration)}
      </div>

      {/* 버튼 영역 */}
      <div className="flex items-center gap-4">
        {!isRecording ? (
          // 시작 버튼
          <button
            onClick={onStart}
            className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 active:bg-red-700
                       flex items-center justify-center transition-colors shadow-lg shadow-red-500/30"
          >
            <div className="w-8 h-8 rounded-full bg-white" />
          </button>
        ) : (
          <>
            {/* 일시중지/재개 버튼 */}
            <button
              onClick={isPaused ? onResume : onPause}
              className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors
                ${isPaused
                  ? 'bg-green-500 hover:bg-green-600 active:bg-green-700'
                  : 'bg-yellow-500 hover:bg-yellow-600 active:bg-yellow-700'
                }`}
            >
              {isPaused ? (
                // 재개 아이콘 (▶)
                <svg className="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              ) : (
                // 일시중지 아이콘 (⏸)
                <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              )}
            </button>

            {/* 정지 버튼 */}
            <button
              onClick={onStop}
              className="w-16 h-16 rounded-full bg-slate-600 hover:bg-slate-500 active:bg-slate-400
                         flex items-center justify-center transition-colors"
            >
              <div className="w-6 h-6 rounded-sm bg-white" />
            </button>
          </>
        )}
      </div>

      {/* 상태 텍스트 */}
      <p className="text-sm text-slate-400">
        {!isRecording && '녹음 시작을 눌러주세요'}
        {isRecording && !isPaused && '녹음 중...'}
        {isRecording && isPaused && '일시 중지됨'}
      </p>
    </div>
  );
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

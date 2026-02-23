"use client";

interface AllDayControlsProps {
  isAllDayActive: boolean;
  isRecording: boolean;
  onStartAllDay: () => void;
  onStopAllDay: () => void;
  onStartGroup: () => void;
  onStopGroup: () => void;
}

export default function AllDayControls({
  isAllDayActive,
  isRecording,
  onStartAllDay,
  onStopAllDay,
  onStartGroup,
  onStopGroup,
}: AllDayControlsProps) {
  // 세션 시작 전: 큰 시작 버튼
  if (!isAllDayActive) {
    return (
      <div className="flex justify-center">
        <button
          onClick={onStartAllDay}
          className="w-20 h-20 bg-red-500 active:bg-red-600 rounded-full flex items-center justify-center transition-colors"
        >
          <div className="w-6 h-6 bg-white rounded-full" />
        </button>
      </div>
    );
  }

  // 녹음 활성: 2개의 버튼만
  return (
    <div className="flex items-center justify-center gap-10">
      {/* 세션그룹 토글 */}
      {isRecording ? (
        <button
          onClick={onStopGroup}
          className="w-16 h-16 rounded-full flex items-center justify-center transition-all active:scale-95"
          style={{ backgroundColor: 'rgba(250, 204, 21, 0.15)' }}
        >
          <div className="flex gap-1.5">
            <div className="w-1.5 h-6 bg-yellow-400 rounded-full" />
            <div className="w-1.5 h-6 bg-yellow-400 rounded-full" />
          </div>
        </button>
      ) : (
        <button
          onClick={onStartGroup}
          className="w-16 h-16 rounded-full flex items-center justify-center transition-all active:scale-95"
          style={{ backgroundColor: 'rgba(74, 222, 128, 0.15)' }}
        >
          <div className="w-0 h-0 border-l-[16px] border-l-green-400 border-y-[10px] border-y-transparent ml-1" />
        </button>
      )}

      {/* 세션 종료 */}
      <button
        onClick={onStopAllDay}
        className="w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-95"
        style={{ backgroundColor: 'rgba(148, 163, 184, 0.1)' }}
      >
        <div className="w-4 h-4 bg-slate-400 rounded-sm" />
      </button>
    </div>
  );
}

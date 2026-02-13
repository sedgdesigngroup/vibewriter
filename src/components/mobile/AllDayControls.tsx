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
  // 하루종일 녹음 시작 전
  if (!isAllDayActive) {
    return (
      <div className="flex justify-center">
        <button
          onClick={onStartAllDay}
          className="w-20 h-20 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center transition-colors shadow-lg shadow-red-500/30"
        >
          <div className="w-6 h-6 bg-white rounded-full" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-6">
      {/* 세션그룹 시작/종료 */}
      {isRecording ? (
        <button
          onClick={onStopGroup}
          className="w-16 h-16 bg-yellow-500 hover:bg-yellow-600 rounded-full flex items-center justify-center transition-colors shadow-lg shadow-yellow-500/30"
          title="녹음 일시중지"
        >
          <div className="flex gap-1">
            <div className="w-1.5 h-5 bg-white rounded-sm" />
            <div className="w-1.5 h-5 bg-white rounded-sm" />
          </div>
        </button>
      ) : (
        <button
          onClick={onStartGroup}
          className="w-16 h-16 bg-green-500 hover:bg-green-600 rounded-full flex items-center justify-center transition-colors shadow-lg shadow-green-500/30"
          title="녹음 재개"
        >
          <div className="w-0 h-0 border-l-[14px] border-l-white border-y-[9px] border-y-transparent ml-1" />
        </button>
      )}

      {/* 하루 종료 */}
      <button
        onClick={onStopAllDay}
        className="w-12 h-12 bg-slate-600 hover:bg-slate-500 rounded-full flex items-center justify-center transition-colors"
        title="하루 종료 및 저장"
      >
        <div className="w-4 h-4 bg-white rounded-sm" />
      </button>
    </div>
  );
}

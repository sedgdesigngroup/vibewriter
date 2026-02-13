"use client";

import type { AllDaySession } from '@/types';

interface SessionRecoveryBannerProps {
  session: AllDaySession;
  onContinue: () => void;
  onNewSession: () => void;
  onDiscard: () => void;
}

export default function SessionRecoveryBanner({
  session,
  onContinue,
  onNewSession,
  onDiscard,
}: SessionRecoveryBannerProps) {
  const totalSegments = session.sessionGroups.reduce(
    (acc, group) => acc + group.sessions.reduce(
      (a, s) => a + s.segments.length, 0
    ), 0
  );

  const totalSessions = session.sessionGroups.reduce(
    (acc, group) => acc + group.sessions.length, 0
  );

  return (
    <div className="bg-sky-900/50 border border-sky-500/30 rounded-xl p-4 mb-4">
      <p className="text-sky-300 text-sm font-medium mb-2">
        이전 녹음 세션이 있습니다
      </p>
      <div className="text-slate-400 text-xs mb-3 space-y-0.5">
        <p>날짜: {session.startDate}</p>
        <p>시작: {formatTime(session.startTime)}</p>
        <p>{session.sessionGroups.length}그룹 / {totalSessions}세션 / {totalSegments}건</p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onContinue}
          className="flex-1 bg-sky-500 hover:bg-sky-600 text-white text-sm py-2 rounded-lg transition-colors"
        >
          이어서 녹음
        </button>
        <button
          onClick={onNewSession}
          className="flex-1 bg-slate-700 hover:bg-slate-600 text-white text-sm py-2 rounded-lg transition-colors"
        >
          새로 시작
        </button>
        <button
          onClick={onDiscard}
          className="px-3 bg-slate-800 hover:bg-slate-700 text-red-400 text-sm py-2 rounded-lg transition-colors"
        >
          삭제
        </button>
      </div>
    </div>
  );
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

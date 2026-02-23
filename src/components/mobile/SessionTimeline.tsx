"use client";

import { useEffect, useRef } from 'react';
import type { SessionGroup, SpeechSession, BackgroundGap } from '@/types';

interface SessionTimelineProps {
  sessionGroups: SessionGroup[];
  currentGroupSessions: SpeechSession[];
  currentSession: SpeechSession | null;
  gaps: BackgroundGap[];
  interimText: string;
  voiceDetected?: boolean;
  compact?: boolean;
}

export default function SessionTimeline({
  sessionGroups,
  currentGroupSessions,
  currentSession,
  gaps,
  interimText,
  voiceDetected = false,
  compact = false,
}: SessionTimelineProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sessionGroups, currentGroupSessions, currentSession?.segments.length, interimText]);

  // 모든 세션을 시간순으로 모으기
  const allSessions: SpeechSession[] = [];
  for (const group of sessionGroups) {
    allSessions.push(...group.sessions);
  }
  allSessions.push(...currentGroupSessions);
  if (currentSession && currentSession.segments.length > 0) {
    allSessions.push(currentSession);
  }

  const isEmpty = allSessions.length === 0 && !interimText;

  // compact 모드: 최근 텍스트만 보여줌
  if (compact) {
    const recentSegments = allSessions
      .flatMap(s => s.segments)
      .slice(-3);

    return (
      <div className="flex-1 overflow-hidden px-2">
        <div className="flex flex-col justify-end h-full gap-1">
          {recentSegments.map((seg) => (
            <p key={seg.id} className="text-slate-500 text-xs leading-relaxed truncate">
              {seg.content}
            </p>
          ))}
          {interimText && (
            <p className="text-slate-600 text-xs italic truncate">{interimText}</p>
          )}
          {!interimText && voiceDetected && (
            <p className="text-emerald-500/50 text-xs italic truncate animate-pulse">음성을 감지하는 중...</p>
          )}
          {recentSegments.length === 0 && !interimText && !voiceDetected && (
            <p className="text-slate-700 text-xs text-center">말씀해 주세요...</p>
          )}
        </div>
      </div>
    );
  }

  // 전체 모드 (녹음 중지 후)
  return (
    <div className="flex-1 overflow-y-auto rounded-2xl p-4 space-y-4" style={{ backgroundColor: 'rgba(15, 23, 42, 0.5)' }}>
      {isEmpty && (
        <p className="text-slate-600 text-center text-sm">
          녹음을 시작하면 텍스트가 기록됩니다
        </p>
      )}

      {allSessions.map((session, idx) => {
        const prevSession = idx > 0 ? allSessions[idx - 1] : null;
        const showGap = prevSession?.endTime && session.startTime - prevSession.endTime > 60000;
        const gapEntry = showGap ? gaps.find(g =>
          g.startTime >= (prevSession?.endTime || 0) &&
          g.endTime <= session.startTime
        ) : null;

        return (
          <div key={session.id}>
            {showGap && (
              <div className="flex items-center gap-2 my-3">
                <div className="flex-1 h-px bg-slate-800" />
                <span className="text-slate-600 text-[10px]">
                  {gapEntry ? '중단' : '침묵'}
                  {' '}
                  {formatGapDuration(
                    prevSession?.endTime || 0,
                    session.startTime
                  )}
                </span>
                <div className="flex-1 h-px bg-slate-800" />
              </div>
            )}

            <div className="pl-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-slate-500 text-[10px] font-medium">
                  {formatClockTime(session.startTime)}
                  {session.endTime && (
                    <> — {formatClockTime(session.endTime)}</>
                  )}
                </span>
                <span className="text-slate-700 text-[10px]">
                  {session.segments.length}건
                </span>
              </div>
              <div className="space-y-1">
                {session.segments.map((seg) => (
                  <p key={seg.id} className="text-slate-300 text-sm leading-relaxed">
                    {seg.content}
                  </p>
                ))}
              </div>
            </div>
          </div>
        );
      })}

      {interimText && (
        <div className="pl-1">
          <p className="text-slate-500 text-sm italic">{interimText}</p>
        </div>
      )}
      {!interimText && voiceDetected && (
        <div className="pl-1">
          <p className="text-emerald-500/50 text-sm italic animate-pulse">음성을 감지하는 중...</p>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}

function formatClockTime(timestamp: number): string {
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatGapDuration(start: number, end: number): string {
  const ms = end - start;
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return '';
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const remainMin = minutes % 60;
  return `${hours}시간 ${remainMin}분`;
}

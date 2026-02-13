"use client";

import { useEffect, useRef } from 'react';
import type { SessionGroup, SpeechSession, BackgroundGap } from '@/types';

interface SessionTimelineProps {
  sessionGroups: SessionGroup[];
  currentGroupSessions: SpeechSession[];
  currentSession: SpeechSession | null;
  gaps: BackgroundGap[];
  interimText: string;
}

export default function SessionTimeline({
  sessionGroups,
  currentGroupSessions,
  currentSession,
  gaps,
  interimText,
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

  return (
    <div className="flex-1 overflow-y-auto bg-slate-800 rounded-lg p-4 space-y-4">
      {isEmpty && (
        <p className="text-slate-500 text-center text-sm">
          녹음을 시작하면 시간대별로 텍스트가 기록됩니다
        </p>
      )}

      {allSessions.map((session, idx) => {
        // 이전 세션과의 갭 표시
        const prevSession = idx > 0 ? allSessions[idx - 1] : null;
        const showGap = prevSession?.endTime && session.startTime - prevSession.endTime > 60000;
        const gapEntry = showGap ? gaps.find(g =>
          g.startTime >= (prevSession?.endTime || 0) &&
          g.endTime <= session.startTime
        ) : null;

        return (
          <div key={session.id}>
            {showGap && (
              <div className="flex items-center gap-2 my-2">
                <div className="flex-1 h-px bg-slate-700" />
                <span className="text-slate-600 text-xs">
                  {gapEntry ? '백그라운드 중단' : '침묵'}
                  {' '}
                  {formatGapDuration(
                    prevSession?.endTime || 0,
                    session.startTime
                  )}
                </span>
                <div className="flex-1 h-px bg-slate-700" />
              </div>
            )}

            <div className="border-l-2 border-sky-500/50 pl-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sky-400 text-xs font-medium">
                  {formatClockTime(session.startTime)}
                  {session.endTime && (
                    <> ~ {formatClockTime(session.endTime)}</>
                  )}
                </span>
                <span className="text-slate-600 text-xs">
                  {session.segments.length}건
                </span>
              </div>
              <div className="space-y-1">
                {session.segments.map((seg) => (
                  <p key={seg.id} className="text-slate-200 text-sm leading-relaxed">
                    {seg.content}
                  </p>
                ))}
              </div>
            </div>
          </div>
        );
      })}

      {/* 현재 인식 중인 텍스트 */}
      {interimText && (
        <div className="border-l-2 border-slate-600 pl-3">
          <p className="text-slate-400 text-sm italic">{interimText}</p>
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

"use client";

import { useState, useEffect, useCallback } from 'react';
import { useAllDayStore } from '@/stores/allDayStore';
import { useAllDaySpeechRecognition } from '@/hooks/useAllDaySpeechRecognition';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useSilentAudioKeepAlive } from '@/hooks/useSilentAudioKeepAlive';
import { useBackgroundDetection } from '@/hooks/useBackgroundDetection';
import { useSessionPersistence } from '@/hooks/useSessionPersistence';
import AllDayStatusBar from './AllDayStatusBar';
import AllDayControls from './AllDayControls';
import SessionTimeline from './SessionTimeline';
import SessionRecoveryBanner from './SessionRecoveryBanner';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import SaveIdDialog from './SaveIdDialog';

const STORAGE_KEY = 'vibe-writing-userId';

interface AllDayRecordingViewProps {
  onSwitchMode?: () => void;
}

export default function AllDayRecordingView({ onSwitchMode }: AllDayRecordingViewProps) {
  const {
    allDaySession,
    currentSessionGroup,
    currentSession,
    isRecording,
    interimText,
    startAllDay,
    stopAllDay,
    startSessionGroup,
    stopSessionGroup,
    onBackgrounded,
    onForegrounded,
    recoverSession,
    reset,
  } = useAllDayStore();

  const { startRecognition, stopRecognition, forceRestart } = useAllDaySpeechRecognition();
  const { acquire: acquireWakeLock, release: releaseWakeLock } = useWakeLock();
  const { start: startKeepAlive, stop: stopKeepAlive } = useSilentAudioKeepAlive();
  const { recoverableSession, checked, clearRecoverable, persistNow } = useSessionPersistence();

  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedUserId, setSavedUserId] = useState<string | null>(null);
  const [elapsedTick, setElapsedTick] = useState(0);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) setSavedUserId(stored);
  }, []);

  // 경과 시간 갱신 (1초마다)
  useEffect(() => {
    if (!allDaySession) return;
    const timer = setInterval(() => setElapsedTick(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, [allDaySession?.id]);

  // 백그라운드 감지
  useBackgroundDetection({
    enabled: !!allDaySession && allDaySession.status === 'active',
    onBackgrounded: useCallback(() => {
      onBackgrounded();
      persistNow();
    }, [onBackgrounded, persistNow]),
    onForegrounded: useCallback((_gapMs: number) => {
      onForegrounded();
      if (isRecording) {
        forceRestart();
        acquireWakeLock();
      }
    }, [onForegrounded, isRecording, forceRestart, acquireWakeLock]),
  });

  // 하루종일 녹음 시작
  const handleStartAllDay = useCallback(async () => {
    startAllDay();
    startSessionGroup();
    startRecognition();
    await acquireWakeLock();
    startKeepAlive();
  }, [startAllDay, startSessionGroup, startRecognition, acquireWakeLock, startKeepAlive]);

  // 세션그룹 시작 (녹음 on)
  const handleStartGroup = useCallback(async () => {
    startSessionGroup();
    startRecognition();
    await acquireWakeLock();
    startKeepAlive();
  }, [startSessionGroup, startRecognition, acquireWakeLock, startKeepAlive]);

  // 세션그룹 종료 (녹음 off)
  const handleStopGroup = useCallback(() => {
    stopRecognition();
    stopSessionGroup();
    releaseWakeLock();
    stopKeepAlive();
  }, [stopRecognition, stopSessionGroup, releaseWakeLock, stopKeepAlive]);

  // 하루 종료 요청
  const handleStopAllDayRequest = useCallback(() => {
    setShowStopConfirm(true);
  }, []);

  // 하루 종료 확인
  const handleStopAllDayConfirm = useCallback(() => {
    setShowStopConfirm(false);
    stopRecognition();
    stopKeepAlive();
    releaseWakeLock();
    const finalSession = stopAllDay();

    if (!finalSession || getTotalSegments(finalSession) === 0) {
      reset();
      return;
    }

    // 저장 플로우
    const storedId = localStorage.getItem(STORAGE_KEY);
    if (storedId) {
      handleSave(storedId);
    } else {
      setShowSaveDialog(true);
    }
  }, [stopRecognition, stopKeepAlive, releaseWakeLock, stopAllDay, reset]);

  // 저장
  const handleSave = useCallback(async (userId: string) => {
    setIsSaving(true);
    try {
      localStorage.setItem(STORAGE_KEY, userId);
      setSavedUserId(userId);

      const session = useAllDayStore.getState().allDaySession;
      if (!session) {
        setIsSaving(false);
        return;
      }

      // 1. 사용자 확인
      const authRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (!authRes.ok) {
        alert('사용자 확인에 실패했습니다.');
        setIsSaving(false);
        return;
      }

      // 2. 프로젝트 생성
      const totalDuration = session.endTime
        ? Math.floor((session.endTime - session.startTime) / 1000)
        : 0;

      const projectRes = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          totalDurationSeconds: totalDuration,
        }),
      });
      if (!projectRes.ok) {
        alert('프로젝트 생성에 실패했습니다.');
        setIsSaving(false);
        return;
      }
      const project = await projectRes.json();

      // 3. 세그먼트 플래튼 후 저장
      const flatSegments = session.sessionGroups
        .flatMap(g => g.sessions.flatMap(s => s.segments))
        .sort((a, b) => a.order - b.order);

      const transRes = await fetch('/api/transcription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          segments: flatSegments.map(s => ({
            content: s.content,
            timestamp: s.timestamp,
            order: s.order,
          })),
        }),
      });
      if (!transRes.ok) {
        console.error('전사 데이터 저장 실패');
      }

      // 4. GPT 템플릿 생성 트리거
      fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id }),
      }).catch(console.error);

      // IndexedDB 정리
      await clearRecoverable();

      setShowSaveDialog(false);
      reset();
      alert('저장되었습니다! 템플릿 생성이 진행 중입니다.');
    } catch (err) {
      console.error('저장 실패:', err);
      alert('저장에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setIsSaving(false);
    }
  }, [reset, clearRecoverable]);

  // 세션 복구
  const handleRecover = useCallback(async () => {
    if (recoverableSession) {
      recoverSession(recoverableSession);
      await clearRecoverable();
    }
  }, [recoverableSession, recoverSession, clearRecoverable]);

  const handleNewSession = useCallback(async () => {
    await clearRecoverable();
  }, [clearRecoverable]);

  const handleDiscard = useCallback(async () => {
    await clearRecoverable();
  }, [clearRecoverable]);

  // 통계 계산
  const allGroups = allDaySession?.sessionGroups || [];
  const completedSessions = allGroups.flatMap(g => g.sessions);
  const currentGroupCompletedSessions = currentSessionGroup?.sessions || [];
  const totalSessionCount = completedSessions.length + currentGroupCompletedSessions.length + (currentSession?.segments.length ? 1 : 0);
  const totalSegmentCount = completedSessions.reduce((a, s) => a + s.segments.length, 0)
    + currentGroupCompletedSessions.reduce((a, s) => a + s.segments.length, 0)
    + (currentSession?.segments.length || 0);

  // 이 변수를 사용하여 경과 시간을 실시간으로 표시
  void elapsedTick;

  return (
    <div className="flex flex-col h-screen bg-slate-900 p-4 pt-safe">
      {/* 헤더 */}
      <div className="relative text-center mb-3">
        <h1 className="text-xl font-bold text-white">상시 녹음</h1>
        {savedUserId && (
          <p className="text-slate-400 text-xs mt-1">{savedUserId}</p>
        )}
        {!allDaySession && onSwitchMode && (
          <button
            onClick={onSwitchMode}
            className="inline-block mt-2 px-3 py-1 bg-slate-700/50 text-slate-400 text-xs rounded-full hover:bg-slate-700 transition-colors"
          >
            일반 녹음 모드
          </button>
        )}
      </div>

      {/* 저장 중 오버레이 */}
      {isSaving && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-slate-800 rounded-2xl p-6 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-white font-medium">저장 중...</p>
          </div>
        </div>
      )}

      {/* 세션 복구 배너 */}
      {checked && recoverableSession && !allDaySession && (
        <SessionRecoveryBanner
          session={recoverableSession}
          onContinue={handleRecover}
          onNewSession={handleNewSession}
          onDiscard={handleDiscard}
        />
      )}

      {/* 상태바 */}
      <AllDayStatusBar
        isAllDayActive={!!allDaySession}
        isRecording={isRecording}
        sessionGroupCount={allGroups.length + (currentSessionGroup ? 1 : 0)}
        sessionCount={totalSessionCount}
        segmentCount={totalSegmentCount}
        startTime={allDaySession?.startTime || null}
      />

      {/* 타임라인 */}
      <SessionTimeline
        sessionGroups={allGroups}
        currentGroupSessions={currentGroupCompletedSessions}
        currentSession={currentSession}
        gaps={allDaySession?.gaps || []}
        interimText={interimText}
      />

      {/* 컨트롤 */}
      <div className="mt-4 pb-4">
        <AllDayControls
          isAllDayActive={!!allDaySession}
          isRecording={isRecording}
          onStartAllDay={handleStartAllDay}
          onStopAllDay={handleStopAllDayRequest}
          onStartGroup={handleStartGroup}
          onStopGroup={handleStopGroup}
        />
      </div>

      {/* 종료 확인 */}
      <ConfirmDialog
        isOpen={showStopConfirm}
        message="하루 녹음을 종료하고 저장하시겠습니까?"
        onConfirm={handleStopAllDayConfirm}
        onCancel={() => setShowStopConfirm(false)}
      />

      {/* 저장 다이얼로그 */}
      <SaveIdDialog
        isOpen={showSaveDialog}
        onSave={handleSave}
        onClose={() => { setShowSaveDialog(false); reset(); }}
        isSaving={isSaving}
      />

      {/* 녹음 중 안내 */}
      {isRecording && (
        <div className="fixed top-0 left-0 right-0 bg-green-500/90 text-center py-1 text-xs text-green-900 font-medium">
          녹음 중 — 화면을 켜놓은 상태로 유지해주세요
        </div>
      )}
    </div>
  );
}

function getTotalSegments(session: { sessionGroups: Array<{ sessions: Array<{ segments: unknown[] }> }> }): number {
  return session.sessionGroups.reduce(
    (acc, g) => acc + g.sessions.reduce((a, s) => a + s.segments.length, 0), 0
  );
}

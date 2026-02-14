"use client";

import { useState, useEffect, useCallback } from 'react';
import { useAllDayStore } from '@/stores/allDayStore';
import { useHybridSTT } from '@/hooks/useHybridSTT';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import { useAudioVisualizer } from '@/hooks/useAudioVisualizer';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useSilentAudioKeepAlive } from '@/hooks/useSilentAudioKeepAlive';
import { useBackgroundDetection } from '@/hooks/useBackgroundDetection';
import { useSessionPersistence } from '@/hooks/useSessionPersistence';
import AllDayStatusBar from './AllDayStatusBar';
import AllDayControls from './AllDayControls';
import SessionTimeline from './SessionTimeline';
import SessionRecoveryBanner from './SessionRecoveryBanner';
import AudioVisualizer from './AudioVisualizer';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import SaveIdDialog from './SaveIdDialog';
import type { TranscriptionSegment } from '@/types';

const STORAGE_KEY = 'vibe-writing-userId';

export default function AllDayRecordingView() {
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
    replaceCurrentGroupSegments,
    reset,
    addSegment,
    setInterimText,
  } = useAllDayStore();

  const { start: startAudioRec, stop: stopAudioRec, getRecentBlob } = useAudioRecorder();
  const { start: startVisualizer, stop: stopVisualizer } = useAudioVisualizer();

  // Whisper 폴백 전환 시: 밀린 구간 오디오를 추출하여 Whisper로 전사
  const handleFallbackActivated = useCallback(async (missedSeconds: number) => {
    if (missedSeconds <= 0) return;

    const missedBlob = getRecentBlob(missedSeconds);
    if (missedBlob.size === 0) return;

    console.log(`[FallbackRecovery] 밀린 ${missedSeconds}초 오디오를 Whisper로 전송`);

    try {
      const formData = new FormData();
      formData.append('audio', missedBlob, `missed_${Date.now()}.webm`);

      const res = await fetch('/api/whisper', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const result = await res.json();
        if (result.segments && result.segments.length > 0) {
          for (const seg of result.segments) {
            const text = (seg.text || '').trim();
            if (text) {
              addSegment(text, 'whisper');
            }
          }
        } else if (result.text && result.text.trim()) {
          addSegment(result.text.trim(), 'whisper');
        }
      }
    } catch (err) {
      console.error('[FallbackRecovery] 밀린 구간 전사 실패:', err);
    }
  }, [getRecentBlob, addSegment]);

  const { start: startSTT, stop: stopSTT, forceRestart, mode: sttMode } = useHybridSTT({
    addSegment,
    setInterimText,
    onFallbackActivated: handleFallbackActivated,
  });
  const { acquire: acquireWakeLock, release: releaseWakeLock } = useWakeLock();
  const { start: startKeepAlive, stop: stopKeepAlive } = useSilentAudioKeepAlive();
  const { recoverableSession, checked, clearRecoverable, persistNow } = useSessionPersistence();

  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [savedUserId, setSavedUserId] = useState<string | null>(null);
  const [elapsedTick, setElapsedTick] = useState(0);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) setSavedUserId(stored);
  }, []);

  // 경과 시간 갱신 (5초마다)
  useEffect(() => {
    if (!allDaySession) return;
    const timer = setInterval(() => setElapsedTick(t => t + 1), 5000);
    return () => clearInterval(timer);
  }, [allDaySession?.id]);

  // 백그라운드 감지
  useBackgroundDetection({
    enabled: !!allDaySession && allDaySession.status === 'active',
    onBackgrounded: useCallback(() => {
      onBackgrounded();
      persistNow();
      startKeepAlive();
    }, [onBackgrounded, persistNow, startKeepAlive]),
    onForegrounded: useCallback((_gapMs: number) => {
      stopKeepAlive();
      onForegrounded();
      if (isRecording) {
        forceRestart();
        acquireWakeLock();
      }
    }, [stopKeepAlive, onForegrounded, isRecording, forceRestart, acquireWakeLock]),
  });

  // 세션 시작 + 첫 세션그룹
  const handleStartAllDay = useCallback(async () => {
    try {
      startAllDay();
      startSessionGroup();

      const result = await startVisualizer();
      setAnalyser(result.analyser);
      startAudioRec(result.stream);
      startSTT();
      await acquireWakeLock();
    } catch {
      // 마이크 접근 실패 시 정리
      stopAllDay();
      reset();
    }
  }, [startAllDay, startSessionGroup, startVisualizer, startAudioRec, startSTT, acquireWakeLock, stopAllDay, reset]);

  // 세션그룹 ON (녹음 재시작)
  const handleStartGroup = useCallback(async () => {
    try {
      startSessionGroup();

      const result = await startVisualizer();
      setAnalyser(result.analyser);
      startAudioRec(result.stream);
      startSTT();
      await acquireWakeLock();
    } catch {
      // 마이크 접근 실패
    }
  }, [startSessionGroup, startVisualizer, startAudioRec, startSTT, acquireWakeLock]);

  // 세션그룹 OFF (녹음 중지 + Whisper 재전사)
  const handleStopGroup = useCallback(async () => {
    await stopSTT();
    stopVisualizer();
    setAnalyser(null);
    releaseWakeLock();
    stopKeepAlive();

    // 오디오 획득 후 Whisper 재전사
    const audioBlob = await stopAudioRec();
    stopSessionGroup();

    if (audioBlob.size > 0) {
      setIsTranscribing(true);
      try {
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.webm');

        const res = await fetch('/api/whisper', {
          method: 'POST',
          body: formData,
        });

        if (res.ok) {
          const result = await res.json();
          const session = useAllDayStore.getState().allDaySession;
          const sessionId = session?.id || '';

          const whisperSegments: TranscriptionSegment[] = (result.segments || []).map(
            (seg: { start: number; end: number; text: string }, i: number) => ({
              id: `wseg_${Date.now()}_${i}`,
              sessionId,
              content: seg.text.trim(),
              timestamp: Math.round(seg.start * 1000),
              order: i,
              savedToServer: false,
              source: 'whisper' as const,
            })
          ).filter((seg: TranscriptionSegment) => seg.content);

          if (whisperSegments.length > 0) {
            replaceCurrentGroupSegments(whisperSegments);
          }
        } else {
          console.error('Whisper 재전사 실패, Web Speech 결과 유지');
        }
      } catch (err) {
        console.error('Whisper 재전사 오류:', err);
      } finally {
        setIsTranscribing(false);
      }
    }
    // audioBlob은 여기서 스코프를 벗어나 GC 대상
  }, [stopSTT, stopVisualizer, releaseWakeLock, stopKeepAlive, stopAudioRec, stopSessionGroup, replaceCurrentGroupSegments]);

  // 세션 종료 요청
  const handleStopAllDayRequest = useCallback(() => {
    setShowStopConfirm(true);
  }, []);

  // 세션 종료 확인
  const handleStopAllDayConfirm = useCallback(async () => {
    setShowStopConfirm(false);

    // 녹음 중이면 먼저 세션그룹 종료 (재전사 포함)
    if (isRecording) {
      await handleStopGroup();
    }

    const finalSession = stopAllDay();

    if (!finalSession || getTotalSegments(finalSession) === 0) {
      reset();
      return;
    }

    const storedId = localStorage.getItem(STORAGE_KEY);
    if (storedId) {
      handleSave(storedId);
    } else {
      setShowSaveDialog(true);
    }
  }, [isRecording, handleStopGroup, stopAllDay, reset]);

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

  const handleLogout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setSavedUserId(null);
  }, []);

  // 통계 계산
  const allGroups = allDaySession?.sessionGroups || [];
  const completedSessions = allGroups.flatMap(g => g.sessions);
  const currentGroupCompletedSessions = currentSessionGroup?.sessions || [];
  const totalSessionCount = completedSessions.length + currentGroupCompletedSessions.length + (currentSession?.segments.length ? 1 : 0);
  const totalSegmentCount = completedSessions.reduce((a, s) => a + s.segments.length, 0)
    + currentGroupCompletedSessions.reduce((a, s) => a + s.segments.length, 0)
    + (currentSession?.segments.length || 0);

  void elapsedTick;

  return (
    <div className="flex flex-col h-screen bg-slate-900 p-4 pt-safe">
      {/* 헤더 */}
      <div className="relative text-center mb-3">
        <h1 className="text-xl font-bold text-white">바이브라이팅</h1>
        {savedUserId ? (
          <div className="flex items-center justify-center gap-2 mt-1">
            <span className="text-slate-400 text-xs">{savedUserId}</span>
            {!allDaySession && (
              <button
                onClick={handleLogout}
                className="text-xs text-red-400 hover:text-red-300"
              >
                로그아웃
              </button>
            )}
          </div>
        ) : (
          <p className="text-slate-400 text-xs mt-1">음성을 텍스트로 전사합니다</p>
        )}
      </div>

      {/* AI 재전사 중 표시 */}
      {isTranscribing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-slate-800 rounded-2xl p-6 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-white font-medium">AI 전사 중...</p>
            <p className="text-slate-400 text-xs mt-1">고정확도 전사를 진행하고 있습니다</p>
          </div>
        </div>
      )}

      {/* 저장 중 오버레이 */}
      {isSaving && !isTranscribing && (
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

      {/* 오디오 파형 시각화 */}
      {allDaySession && (
        <div className="mb-3">
          <AudioVisualizer analyser={analyser} isActive={isRecording} />
        </div>
      )}

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
        message="녹음을 종료하고 저장하시겠습니까?"
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

      {/* 녹음 중 상태 배너 */}
      {isRecording && (
        <div className={`fixed top-0 left-0 right-0 text-center py-1 text-xs font-medium ${
          sttMode === 'whisper'
            ? 'bg-orange-500/90 text-orange-900'
            : 'bg-green-500/90 text-green-900'
        }`}>
          {sttMode === 'whisper'
            ? 'AI 음성인식 모드 (Whisper) — 화면을 켜놓은 상태로 유지해주세요'
            : '녹음 중 — 화면을 켜놓은 상태로 유지해주세요'}
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

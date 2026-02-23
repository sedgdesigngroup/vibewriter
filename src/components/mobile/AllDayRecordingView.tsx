"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAllDayStore } from '@/stores/allDayStore';
import { useHybridSTT } from '@/hooks/useHybridSTT';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import { useAudioVisualizer } from '@/hooks/useAudioVisualizer';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useSilentAudioKeepAlive } from '@/hooks/useSilentAudioKeepAlive';
import { useBackgroundDetection } from '@/hooks/useBackgroundDetection';
import toast, { Toaster } from 'react-hot-toast';
import { useSessionPersistence } from '@/hooks/useSessionPersistence';
import AllDayStatusBar from './AllDayStatusBar';
import AllDayControls from './AllDayControls';
import SessionTimeline from './SessionTimeline';
import SessionRecoveryBanner from './SessionRecoveryBanner';
import SilenceProgressRing from './SilenceProgressRing';
import AudioVisualizer from './AudioVisualizer';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import SaveIdDialog from './SaveIdDialog';
import type { TranscriptionSegment } from '@/types';

const VOICE_RMS_THRESHOLD = 0.01; // 민감도 향상 (0.02 → 0.01)

const STORAGE_KEY = 'vibe-writing-userId';
const SILENCE_AUTO_SPLIT_MS = 60 * 1000; // 60초 침묵 → 세션 자동 분리

export default function AllDayRecordingView() {
  const {
    allDaySession,
    currentSessionGroup,
    currentSession,
    isRecording,
    interimText,
    lastSpeechTime,
    startAllDay,
    stopAllDay,
    startSessionGroup,
    stopSessionGroup,
    onBackgrounded,
    onForegrounded,
    recoverSession,
    replaceCurrentGroupSegments,
    finalizeSession,
    reset,
    addSegment,
    setInterimText,
  } = useAllDayStore();

  const { start: startAudioRec, stop: stopAudioRec } = useAudioRecorder();
  const { start: startVisualizer, stop: stopVisualizer } = useAudioVisualizer();
  const streamRef = useRef<MediaStream | null>(null);

  const { start: startSTT, stop: stopSTT, forceRestart, flush: flushSTT } = useHybridSTT({
    addSegment,
    setInterimText,
  });
  const { acquire: acquireWakeLock, release: releaseWakeLock } = useWakeLock();
  const { start: startKeepAlive, stop: stopKeepAlive } = useSilentAudioKeepAlive();
  const { recoverableSession, checked, clearRecoverable, persistNow } = useSessionPersistence();

  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [showRetryDialog, setShowRetryDialog] = useState(false);
  const retryBlobRef = useRef<Blob | null>(null);
  const [savedUserId, setSavedUserId] = useState<string | null>(null);
  const [elapsedTick, setElapsedTick] = useState(0);
  const [voiceDetected, setVoiceDetected] = useState(false);

  // 오디오 레벨 기반 음성 감지 + 침묵 타이머 연동
  const lastTouchRef = useRef(0);
  useEffect(() => {
    if (!analyser || !isRecording) {
      setVoiceDetected(false);
      return;
    }

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let animId: number;

    const check = () => {
      analyser.getByteTimeDomainData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const v = (dataArray[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      const detected = rms > VOICE_RMS_THRESHOLD;
      setVoiceDetected(detected);

      // 음성 감지 시 lastSpeechTime 갱신 (500ms throttle)
      if (detected) {
        const now = Date.now();
        if (now - lastTouchRef.current > 500) {
          lastTouchRef.current = now;
          useAllDayStore.setState({ lastSpeechTime: now });
        }
      }

      animId = requestAnimationFrame(check);
    };

    check();
    return () => cancelAnimationFrame(animId);
  }, [analyser, isRecording]);

  // 60초 침묵 자동 세션 분리 타이머
  const silenceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isRecording) {
      if (silenceTimerRef.current) {
        clearInterval(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      return;
    }

    silenceTimerRef.current = setInterval(async () => {
      const state = useAllDayStore.getState();
      if (!state.isRecording || !state.lastSpeechTime || !state.currentSession) return;
      if (state.currentSession.segments.length === 0) return;

      const silenceMs = Date.now() - state.lastSpeechTime;
      if (silenceMs >= SILENCE_AUTO_SPLIT_MS) {
        await flushSTT(); // 남은 청크를 전사한 뒤 분리
        finalizeSession();
      }
    }, 2000);

    return () => {
      if (silenceTimerRef.current) {
        clearInterval(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
    };
  }, [isRecording, finalizeSession, flushSTT]);

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
      startKeepAlive();
    }, [onBackgrounded, persistNow, startKeepAlive]),
    onForegrounded: useCallback((_gapMs: number) => {
      stopKeepAlive();
      onForegrounded();
      if (isRecording) {
        forceRestart(streamRef.current || undefined);
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
      streamRef.current = result.stream;
      startAudioRec(result.stream);
      startSTT(result.stream);
      await acquireWakeLock();
    } catch {
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
      streamRef.current = result.stream;
      startAudioRec(result.stream);
      startSTT(result.stream);
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
    streamRef.current = null;
    releaseWakeLock();
    stopKeepAlive();

    const audioBlob = await stopAudioRec();
    stopSessionGroup();

    if (audioBlob.size > 0) {
      const success = await whisperRetranscribe(audioBlob);
      if (!success) {
        retryBlobRef.current = audioBlob;
        setShowRetryDialog(true);
      }
    }
  }, [stopSTT, stopVisualizer, releaseWakeLock, stopKeepAlive, stopAudioRec, stopSessionGroup]);

  // Whisper 재전사 시도
  const whisperRetranscribe = useCallback(async (audioBlob: Blob): Promise<boolean> => {
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
        return true;
      }
      console.error('Whisper 재전사 실패:', res.status);
      return false;
    } catch (err) {
      console.error('Whisper 재전사 오류:', err);
      return false;
    } finally {
      setIsTranscribing(false);
    }
  }, [replaceCurrentGroupSegments]);

  // 재전사 재시도
  const handleRetryTranscribe = useCallback(async () => {
    setShowRetryDialog(false);
    if (retryBlobRef.current) {
      const success = await whisperRetranscribe(retryBlobRef.current);
      if (!success) {
        setShowRetryDialog(true);
      } else {
        retryBlobRef.current = null;
      }
    }
  }, [whisperRetranscribe]);

  const handleSkipRetranscribe = useCallback(() => {
    setShowRetryDialog(false);
    retryBlobRef.current = null;
  }, []);

  // 세션 종료 요청
  const handleStopAllDayRequest = useCallback(() => {
    setShowStopConfirm(true);
  }, []);

  // 세션 종료 확인
  const handleStopAllDayConfirm = useCallback(async () => {
    setShowStopConfirm(false);

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

      const authRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (!authRes.ok) {
        toast.error('사용자 확인에 실패했습니다.');
        setIsSaving(false);
        return;
      }

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
        toast.error('프로젝트 생성에 실패했습니다.');
        setIsSaving(false);
        return;
      }
      const project = await projectRes.json();

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

      fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id }),
      }).catch(console.error);

      await clearRecoverable();
      setShowSaveDialog(false);
      reset();
      toast.success('저장되었습니다! 템플릿 생성이 진행 중입니다.');
    } catch (err) {
      console.error('저장 실패:', err);
      toast.error('저장에 실패했습니다. 다시 시도해주세요.');
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

  // 통계
  const allGroups = allDaySession?.sessionGroups || [];
  const completedSessions = allGroups.flatMap(g => g.sessions);
  const currentGroupCompletedSessions = currentSessionGroup?.sessions || [];
  const totalSegmentCount = completedSessions.reduce((a, s) => a + s.segments.length, 0)
    + currentGroupCompletedSessions.reduce((a, s) => a + s.segments.length, 0)
    + (currentSession?.segments.length || 0);

  void elapsedTick;

  return (
    <div className="flex flex-col h-screen bg-slate-900">
      <Toaster position="top-center" toastOptions={{ style: { background: '#1e293b', color: '#fff', borderRadius: '12px' } }} />
      {/* 오버레이들 */}
      {isTranscribing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-slate-800 rounded-2xl p-6 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-white font-medium">AI 전사 중...</p>
            <p className="text-slate-400 text-xs mt-1">고정확도 전사를 진행하고 있습니다</p>
          </div>
        </div>
      )}

      {isSaving && !isTranscribing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-slate-800 rounded-2xl p-6 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-white font-medium">저장 중...</p>
          </div>
        </div>
      )}

      {/* ─── 녹음 활성 상태: 미니멀 UI ─── */}
      {allDaySession && isRecording ? (
        <div className="flex flex-col h-full pt-safe">
          {/* 헤더 */}
          <div className="text-center pt-4 pb-2">
            <h1 className="text-lg font-semibold text-white tracking-tight">바이브라이팅</h1>
            <AllDayStatusBar
              isAllDayActive
              isRecording
              segmentCount={totalSegmentCount}
              startTime={allDaySession.startTime}
              sttMode="whisper"
            />
          </div>

          {/* 중앙: 침묵 프로그레스 링 + 파형 */}
          <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">
            <SilenceProgressRing
              lastSpeechTime={lastSpeechTime}
              isRecording={isRecording}
              silenceThresholdMs={SILENCE_AUTO_SPLIT_MS}
            />

            {/* 오디오 파형 */}
            <div className="w-full max-w-xs">
              <AudioVisualizer analyser={analyser} isActive={isRecording} />
            </div>

            {/* 최근 전사 텍스트 (subtle) */}
            <div className="w-full max-w-xs h-16">
              <SessionTimeline
                sessionGroups={allGroups}
                currentGroupSessions={currentGroupCompletedSessions}
                currentSession={currentSession}
                gaps={allDaySession.gaps || []}
                interimText={interimText}
                voiceDetected={voiceDetected}
                compact
              />
            </div>
          </div>

          {/* 컨트롤 */}
          <div className="pb-8 pt-4">
            <AllDayControls
              isAllDayActive
              isRecording
              onStartAllDay={handleStartAllDay}
              onStopAllDay={handleStopAllDayRequest}
              onStartGroup={handleStartGroup}
              onStopGroup={handleStopGroup}
            />
          </div>
        </div>
      ) : allDaySession && !isRecording ? (
        /* ─── 세션 활성 + 녹음 일시중지: 타임라인 보여줌 ─── */
        <div className="flex flex-col h-full p-4 pt-safe">
          <div className="text-center mb-3">
            <h1 className="text-lg font-semibold text-white tracking-tight">바이브라이팅</h1>
            <AllDayStatusBar
              isAllDayActive
              isRecording={false}
              segmentCount={totalSegmentCount}
              startTime={allDaySession.startTime}
            />
          </div>

          <SessionTimeline
            sessionGroups={allGroups}
            currentGroupSessions={currentGroupCompletedSessions}
            currentSession={currentSession}
            gaps={allDaySession.gaps || []}
            interimText={interimText}
          />

          <div className="mt-4 pb-4">
            <AllDayControls
              isAllDayActive
              isRecording={false}
              onStartAllDay={handleStartAllDay}
              onStopAllDay={handleStopAllDayRequest}
              onStartGroup={handleStartGroup}
              onStopGroup={handleStopGroup}
            />
          </div>
        </div>
      ) : (
        /* ─── 세션 시작 전 ─── */
        <div className="flex flex-col h-full items-center justify-center p-4 pt-safe">
          {/* 세션 복구 배너 */}
          {checked && recoverableSession && (
            <div className="w-full max-w-sm mb-8">
              <SessionRecoveryBanner
                session={recoverableSession}
                onContinue={handleRecover}
                onNewSession={handleNewSession}
                onDiscard={handleDiscard}
              />
            </div>
          )}

          <div className="flex flex-col items-center gap-4 mb-12">
            <h1 className="text-2xl font-bold text-white tracking-tight">바이브라이팅</h1>
            {savedUserId ? (
              <div className="flex items-center gap-2">
                <span className="text-slate-500 text-xs">{savedUserId}</span>
                <button
                  onClick={handleLogout}
                  className="text-xs text-slate-600 active:text-slate-400"
                >
                  로그아웃
                </button>
              </div>
            ) : (
              <p className="text-slate-600 text-sm">음성을 텍스트로 전사합니다</p>
            )}
          </div>

          <AllDayControls
            isAllDayActive={false}
            isRecording={false}
            onStartAllDay={handleStartAllDay}
            onStopAllDay={handleStopAllDayRequest}
            onStartGroup={handleStartGroup}
            onStopGroup={handleStopGroup}
          />
        </div>
      )}

      {/* 다이얼로그 */}
      <ConfirmDialog
        isOpen={showStopConfirm}
        message="녹음을 종료하고 저장하시겠습니까?"
        onConfirm={handleStopAllDayConfirm}
        onCancel={() => setShowStopConfirm(false)}
      />

      <ConfirmDialog
        isOpen={showRetryDialog}
        message="AI 재전사에 실패했습니다. 실시간 전사 결과가 유지됩니다. 재시도하시겠습니까?"
        onConfirm={handleRetryTranscribe}
        onCancel={handleSkipRetranscribe}
        confirmText="재시도"
        cancelText="무시"
      />

      <SaveIdDialog
        isOpen={showSaveDialog}
        onSave={handleSave}
        onClose={() => { setShowSaveDialog(false); reset(); }}
        isSaving={isSaving}
      />
    </div>
  );
}

function getTotalSegments(session: { sessionGroups: Array<{ sessions: Array<{ segments: unknown[] }> }> }): number {
  return session.sessionGroups.reduce(
    (acc, g) => acc + g.sessions.reduce((a, s) => a + s.segments.length, 0), 0
  );
}

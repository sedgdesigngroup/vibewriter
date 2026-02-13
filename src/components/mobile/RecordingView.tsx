"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRecordingStore } from '@/stores/recordingStore';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useAudioVisualizer } from '@/hooks/useAudioVisualizer';
import { saveSegment } from '@/lib/db/indexedDB';
import RecordingControls from './RecordingControls';
import AudioVisualizer from './AudioVisualizer';
import TranscriptionMirror from './TranscriptionMirror';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import SaveIdDialog from './SaveIdDialog';
import toast from 'react-hot-toast';

const STORAGE_KEY = 'vibe-writing-userId';

interface RecordingViewProps {
  onSwitchMode: () => void;
}

export default function RecordingView({ onSwitchMode }: RecordingViewProps) {
  const {
    isRecording,
    isPaused,
    duration,
    segments,
    interimText,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    setDuration,
    reset,
  } = useRecordingStore();

  const { startRecognition, stopRecognition, pauseRecognition, resumeRecognition: resumeSpeech } = useSpeechRecognition();
  const { acquire: acquireWakeLock, release: releaseWakeLock } = useWakeLock();
  const { start: startVisualizer, stop: stopVisualizer, analyserRef } = useAudioVisualizer();

  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [showMicPermission, setShowMicPermission] = useState(false);
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedUserId, setSavedUserId] = useState<string | null>(null);

  // localStorage에서 저장된 아이디 불러오기
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setSavedUserId(stored);
    }
  }, []);

  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedDurationRef = useRef<number>(0);
  const pauseStartTimeRef = useRef<number>(0);

  // 세그먼트 변경 시 IndexedDB에 저장
  const lastSavedCountRef = useRef(0);
  useEffect(() => {
    if (segments.length > lastSavedCountRef.current) {
      const newSegments = segments.slice(lastSavedCountRef.current);
      newSegments.forEach(seg => saveSegment(seg));
      lastSavedCountRef.current = segments.length;
    }
  }, [segments]);

  // 녹음 시간 업데이트
  useEffect(() => {
    if (isRecording && !isPaused) {
      if (startTimeRef.current === 0) {
        startTimeRef.current = Date.now();
      }
      durationIntervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTimeRef.current - pausedDurationRef.current;
        setDuration(elapsed);
      }, 100);
    } else {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    }

    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    };
  }, [isRecording, isPaused, setDuration]);

  const handleStart = useCallback(() => {
    setShowMicPermission(true);
  }, []);

  const handleMicAllow = useCallback(async () => {
    setShowMicPermission(false);
    try {
      const result = await startVisualizer();
      setAnalyser(result.analyser);
      startRecording();
      startRecognition();
      await acquireWakeLock();
      startTimeRef.current = Date.now();
      pausedDurationRef.current = 0;
      lastSavedCountRef.current = 0;
    } catch {
      toast.error('마이크 접근이 거부되었습니다.');
    }
  }, [startVisualizer, startRecording, startRecognition, acquireWakeLock]);

  const handlePause = useCallback(() => {
    pauseRecording();
    pauseRecognition();
    pauseStartTimeRef.current = Date.now();
  }, [pauseRecording, pauseRecognition]);

  const handleResume = useCallback(() => {
    if (pauseStartTimeRef.current > 0) {
      pausedDurationRef.current += Date.now() - pauseStartTimeRef.current;
      pauseStartTimeRef.current = 0;
    }
    resumeRecording();
    resumeSpeech();
  }, [resumeRecording, resumeSpeech]);

  const handleStopRequest = useCallback(() => {
    setShowStopConfirm(true);
  }, []);

  const handleSave = useCallback(async (userId: string) => {
    setIsSaving(true);
    try {
      // localStorage에 아이디 저장 (다음부터 자동 로그인)
      localStorage.setItem(STORAGE_KEY, userId);
      setSavedUserId(userId);

      // 1. 사용자 생성/확인 (없으면 자동 생성)
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

      // 2. 프로젝트 생성
      const projectRes = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          totalDurationSeconds: Math.floor(duration / 1000),
        }),
      });

      if (!projectRes.ok) {
        const err = await projectRes.json();
        toast.error(err.error || '프로젝트 생성에 실패했습니다.');
        setIsSaving(false);
        return;
      }

      const project = await projectRes.json();

      // 3. 전사 데이터 저장
      if (segments.length > 0) {
        const transRes = await fetch('/api/transcription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: project.id,
            segments: segments.map(s => ({
              content: s.content,
              timestamp: s.timestamp,
              order: s.order,
            })),
          }),
        });

        if (!transRes.ok) {
          console.error('전사 데이터 저장 실패');
        }
      }

      // 4. GPT 템플릿 생성 트리거
      fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id }),
      }).catch(console.error); // 백그라운드 실행

      setShowSaveDialog(false);
      reset();
      toast.success('저장되었습니다! 템플릿 생성이 진행 중입니다.');
    } catch (err) {
      console.error('저장 실패:', err);
      toast.error('저장에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setIsSaving(false);
    }
  }, [duration, segments, reset]);

  const handleStopConfirm = useCallback(() => {
    setShowStopConfirm(false);
    stopRecording();
    stopRecognition();
    stopVisualizer();
    setAnalyser(null);
    releaseWakeLock();

    // 저장된 아이디가 있으면 바로 저장, 없으면 다이얼로그 표시
    const storedId = localStorage.getItem(STORAGE_KEY);
    if (storedId) {
      handleSave(storedId);
    } else {
      setShowSaveDialog(true);
    }
  }, [stopRecording, stopRecognition, stopVisualizer, releaseWakeLock, handleSave]);

  const handleSaveClose = useCallback(() => {
    setShowSaveDialog(false);
    reset();
  }, [reset]);

  const handleLogout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setSavedUserId(null);
  }, []);

  return (
    <div className="flex flex-col h-screen bg-slate-900 p-4 pt-safe">
      {/* 헤더 */}
      <div className="relative text-center mb-4">
        <h1 className="text-xl font-bold text-white">바이브라이팅</h1>
        {savedUserId ? (
          <div className="flex items-center justify-center gap-2 mt-1">
            <span className="text-slate-400 text-xs">{savedUserId}</span>
            <button
              onClick={handleLogout}
              disabled={isRecording}
              className="text-xs text-red-400 hover:text-red-300 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              로그아웃
            </button>
          </div>
        ) : (
          <p className="text-slate-400 text-xs mt-1">음성을 텍스트로 전사합니다</p>
        )}
        {!isRecording && (
          <button
            onClick={onSwitchMode}
            className="inline-block mt-2 px-3 py-1 bg-sky-500/20 text-sky-400 text-xs rounded-full hover:bg-sky-500/30 transition-colors"
          >
            상시 녹음 모드
          </button>
        )}
      </div>

      {/* 자동 저장 중 표시 */}
      {isSaving && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-slate-800 rounded-2xl p-6 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-white font-medium">저장 중...</p>
            <p className="text-slate-400 text-xs mt-1">잠시만 기다려주세요</p>
          </div>
        </div>
      )}

      {/* 파형 시각화 */}
      <div className="mb-4">
        <AudioVisualizer analyser={analyser} isActive={isRecording && !isPaused} />
      </div>

      {/* 전사 텍스트 미러링 */}
      <TranscriptionMirror segments={segments} interimText={interimText} />

      {/* 녹음 컨트롤 */}
      <div className="mt-4 pb-4">
        <RecordingControls
          isRecording={isRecording}
          isPaused={isPaused}
          duration={duration}
          onStart={handleStart}
          onPause={handlePause}
          onResume={handleResume}
          onStop={handleStopRequest}
        />
      </div>

      {/* 마이크 허용 다이얼로그 */}
      <ConfirmDialog
        isOpen={showMicPermission}
        message="마이크를 허용하시겠습니까?"
        onConfirm={handleMicAllow}
        onCancel={() => setShowMicPermission(false)}
      />

      {/* 정지 확인 다이얼로그 */}
      <ConfirmDialog
        isOpen={showStopConfirm}
        message="녹음을 완료하시겠습니까?"
        onConfirm={handleStopConfirm}
        onCancel={() => setShowStopConfirm(false)}
      />

      {/* 저장 다이얼로그 */}
      <SaveIdDialog
        isOpen={showSaveDialog}
        onSave={handleSave}
        onClose={handleSaveClose}
        isSaving={isSaving}
      />

      {/* iOS 안내 */}
      {isRecording && (
        <div className="fixed top-0 left-0 right-0 bg-yellow-500/90 text-center py-1 text-xs text-yellow-900 font-medium">
          화면을 켜놓은 상태로 유지해주세요
        </div>
      )}
    </div>
  );
}

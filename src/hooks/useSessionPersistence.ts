"use client";

import { useEffect, useRef, useCallback, useState } from 'react';
import { useAllDayStore } from '@/stores/allDayStore';
import {
  saveAllDaySession,
  getActiveAllDaySession,
  clearAllDaySession,
} from '@/lib/db/indexedDB';
import type { AllDaySession } from '@/types';

/**
 * 하루종일 세션을 IndexedDB에 주기적으로 영속화하고,
 * 앱 재시작 시 복구 가능한 세션이 있는지 확인하는 훅.
 */
export function useSessionPersistence() {
  const [recoverableSession, setRecoverableSession] = useState<AllDaySession | null>(null);
  const [checked, setChecked] = useState(false);
  const persistTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const {
    allDaySession,
    currentSessionGroup,
    currentSession,
  } = useAllDayStore();

  // 현재 상태를 하나의 AllDaySession 객체로 조합하여 저장
  const persistNow = useCallback(async () => {
    const state = useAllDayStore.getState();
    if (!state.allDaySession) return;

    // 현재 진행 중인 세션그룹과 세션을 포함한 스냅샷 생성
    const snapshot: AllDaySession = { ...state.allDaySession };

    if (state.currentSessionGroup) {
      const groupSnapshot = { ...state.currentSessionGroup };
      if (state.currentSession && state.currentSession.segments.length > 0) {
        groupSnapshot.sessions = [...groupSnapshot.sessions, state.currentSession];
      }
      snapshot.sessionGroups = [...snapshot.sessionGroups, groupSnapshot];
    }

    try {
      await saveAllDaySession(snapshot);
    } catch (err) {
      console.error('세션 영속화 실패:', err);
    }
  }, []);

  // 앱 로드 시 복구 가능한 세션 확인
  useEffect(() => {
    async function check() {
      try {
        const active = await getActiveAllDaySession();
        if (active) {
          setRecoverableSession(active);
        }
      } catch {
        // IndexedDB 접근 실패
      } finally {
        setChecked(true);
      }
    }
    check();
  }, []);

  // allDaySession이 활성화되면 주기적 영속화 시작
  useEffect(() => {
    if (!allDaySession || allDaySession.status !== 'active') {
      if (persistTimerRef.current) {
        clearInterval(persistTimerRef.current);
        persistTimerRef.current = null;
      }
      return;
    }

    // 10초마다 영속화
    persistTimerRef.current = setInterval(persistNow, 10000);

    return () => {
      if (persistTimerRef.current) {
        clearInterval(persistTimerRef.current);
        persistTimerRef.current = null;
      }
    };
  }, [allDaySession?.id, allDaySession?.status, persistNow]);

  // 세그먼트가 추가될 때마다 즉시 영속화
  useEffect(() => {
    if (currentSession && currentSession.segments.length > 0) {
      persistNow();
    }
  }, [currentSession?.segments.length, persistNow]);

  // 백그라운드 진입 시 즉시 영속화
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && allDaySession?.status === 'active') {
        persistNow();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [allDaySession?.status, persistNow]);

  // 세션그룹 변경 시 영속화
  useEffect(() => {
    if (allDaySession?.status === 'active') {
      persistNow();
    }
  }, [currentSessionGroup?.id, allDaySession?.status, persistNow]);

  const clearRecoverable = useCallback(async () => {
    if (recoverableSession) {
      await clearAllDaySession(recoverableSession.id);
      setRecoverableSession(null);
    }
  }, [recoverableSession]);

  return {
    recoverableSession,
    checked,
    persistNow,
    clearRecoverable,
  };
}

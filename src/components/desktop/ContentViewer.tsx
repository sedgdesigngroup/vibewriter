"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import type { TemplateType } from '@/types';
import { TEMPLATE_LABELS } from '@/types';

interface ContentViewerProps {
  projectId: string;
}

interface TemplateData {
  template_type: TemplateType;
  content: string | null;
  status: string;
  error_message?: string | null;
}

interface TranscriptionData {
  content: string;
  timestamp_seconds: number;
  segment_order: number;
  session_id?: string | null;
  clock_time?: string | null;
}

interface SessionGroupData {
  id: string;
  start_time: string;
  end_time: string | null;
  group_order: number;
}

interface SessionData {
  id: string;
  session_group_id: string;
  start_time: string;
  end_time: string | null;
  session_order: number;
}

const TEMPLATE_TYPES: TemplateType[] = ['card_news', 'meeting_minutes'];

export default function ContentViewer({ projectId }: ContentViewerProps) {
  const [viewMode, setViewMode] = useState<'raw' | 'template'>('template');
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType>('card_news');
  const [templates, setTemplates] = useState<TemplateData[]>([]);
  const [transcription, setTranscription] = useState<TranscriptionData[]>([]);
  const [sessionGroups, setSessionGroups] = useState<SessionGroupData[]>([]);
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [hasModified, setHasModified] = useState(false);
  const [removedContents, setRemovedContents] = useState<string[]>([]);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  const hasSessionData = sessions.length > 0;

  const fetchData = useCallback(async (isInitial: boolean) => {
    try {
      const res = await fetch(`/api/templates/${projectId}`);
      const data = await res.json();
      setTemplates(data.templates || []);
      setTranscription(data.transcription || []);
      setSessionGroups(data.sessionGroups || []);
      setSessions(data.sessions || []);
    } catch (err) {
      console.error('데이터 로드 실패:', err);
    } finally {
      if (isInitial) setInitialLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    setInitialLoading(true);
    setHasModified(false);
    setRemovedContents([]);
    setSelectedSessionId(null);
    fetchData(true);

    pollingRef.current = setInterval(() => fetchData(false), 10000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [fetchData]);

  const isProcessing = templates.some(t => t.status === 'processing' || t.status === 'pending');
  const currentTemplate = templates.find(t => t.template_type === selectedTemplate);

  useEffect(() => {
    if (!isProcessing && templates.length > 0 && pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, [isProcessing, templates.length]);

  // 세션 클릭 → 해당 원문 하이라이트
  const handleSessionClick = useCallback((sessionId: string) => {
    setSelectedSessionId(prev => prev === sessionId ? null : sessionId);
    setViewMode('raw');
    setTimeout(() => {
      highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }, []);

  // 세션 삭제
  const handleDeleteSession = useCallback(async (sessionId: string) => {
    setShowDeleteConfirm(null);

    try {
      const res = await fetch('/api/sessions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.removedContent) {
          setRemovedContents(prev => [...prev, data.removedContent]);
        }
        setHasModified(true);
        setSelectedSessionId(null);
        await fetchData(false);
      }
    } catch (err) {
      console.error('세션 삭제 실패:', err);
    }
  }, [fetchData]);

  // 템플릿 부분 재생성
  const handleRegenerate = useCallback(async () => {
    setIsRegenerating(true);

    // 기존 템플릿 내용 수집
    const existingTemplates: Record<string, string> = {};
    for (const t of templates) {
      if (t.content) {
        existingTemplates[t.template_type] = t.content;
      }
    }

    const combinedRemoved = removedContents.join('\n');

    try {
      const res = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          mode: 'update',
          removedContent: combinedRemoved,
          existingTemplates,
        }),
      });

      if (res.ok) {
        setHasModified(false);
        setRemovedContents([]);
        // 폴링 재시작
        if (pollingRef.current) clearInterval(pollingRef.current);
        pollingRef.current = setInterval(() => fetchData(false), 10000);
        await fetchData(false);
      }
    } catch (err) {
      console.error('재생성 실패:', err);
    } finally {
      setIsRegenerating(false);
    }
  }, [projectId, templates, removedContents, fetchData]);

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        로딩 중...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 원문/템플릿 토글 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex bg-slate-700 rounded-xl p-1">
          <button
            onClick={() => setViewMode('raw')}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
              viewMode === 'raw' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            원문
          </button>
          <button
            onClick={() => setViewMode('template')}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
              viewMode === 'template' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            템플릿
          </button>
        </div>

        <div className="flex items-center gap-2">
          {isProcessing && (
            <span className="text-blue-400 text-sm animate-pulse">
              템플릿 생성 중...
            </span>
          )}
          {isRegenerating && (
            <span className="text-blue-400 text-sm animate-pulse">
              재생성 중...
            </span>
          )}
        </div>
      </div>

      {/* 수정됨 배너 */}
      {hasModified && !isProcessing && (
        <div className="flex items-center justify-between bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-4 py-2 mb-4">
          <span className="text-yellow-400 text-sm">원문이 수정되었습니다</span>
          <button
            onClick={handleRegenerate}
            disabled={isRegenerating}
            className="px-3 py-1 bg-yellow-500 hover:bg-yellow-600 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
          >
            템플릿 갱신
          </button>
        </div>
      )}

      {/* 템플릿 탭 */}
      {viewMode === 'template' && (
        <div className="flex gap-2 mb-4 overflow-x-auto">
          {TEMPLATE_TYPES.map((type) => {
            const template = templates.find(t => t.template_type === type);
            const isActive = selectedTemplate === type;

            return (
              <button
                key={type}
                onClick={() => setSelectedTemplate(type)}
                className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-sky-500 text-white'
                    : 'bg-slate-700 text-slate-400 hover:text-white'
                } ${template?.status === 'processing' ? 'animate-pulse' : ''}`}
              >
                {TEMPLATE_LABELS[type]}
                {template?.status === 'completed' && ' ✓'}
                {template?.status === 'failed' && ' ✗'}
              </button>
            );
          })}
        </div>
      )}

      {/* 콘텐츠 영역 */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* 세션 사이드바 (세션 데이터가 있을 때만 표시) */}
        {viewMode === 'raw' && hasSessionData && (
          <div className="w-56 flex-shrink-0 overflow-y-auto space-y-2">
            <h3 className="text-slate-400 text-xs font-medium mb-2 sticky top-0 bg-slate-900 py-1">
              세션 목록
            </h3>
            {sessionGroups.map((group) => {
              const groupSessions = sessions.filter(s => s.session_group_id === group.id);
              if (groupSessions.length === 0) return null;

              return (
                <div key={group.id} className="space-y-1">
                  <div className="text-slate-500 text-xs px-2">
                    {formatClockTime(group.start_time)}
                    {group.end_time && <> ~ {formatClockTime(group.end_time)}</>}
                  </div>
                  {groupSessions.map((session) => {
                    const isSelected = selectedSessionId === session.id;
                    const segCount = transcription.filter(t => t.session_id === session.id).length;
                    const preview = transcription.find(t => t.session_id === session.id)?.content || '';

                    return (
                      <div key={session.id} className="relative group">
                        <button
                          onClick={() => handleSessionClick(session.id)}
                          className={`w-full text-left px-2 py-1.5 rounded-lg text-xs transition-colors ${
                            isSelected
                              ? 'bg-sky-500/20 border border-sky-500/40'
                              : 'bg-slate-800 hover:bg-slate-700 border border-transparent'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-sky-400">
                              {formatClockTime(session.start_time)}
                            </span>
                            <span className="text-slate-600">{segCount}건</span>
                          </div>
                          <p className="text-slate-400 truncate">{preview}</p>
                        </button>
                        <button
                          onClick={() => setShowDeleteConfirm(session.id)}
                          className="absolute top-1 right-1 hidden group-hover:block text-red-400 hover:text-red-300 text-xs px-1"
                          title="세션 삭제"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {/* 메인 콘텐츠 */}
        <div className="flex-1 overflow-y-auto bg-slate-800 rounded-xl p-6">
          {viewMode === 'raw' ? (
            <div className="space-y-3">
              {transcription.length === 0 ? (
                <p className="text-slate-500 text-center">전사 데이터가 없습니다</p>
              ) : (
                transcription.map((seg) => {
                  const isHighlighted = selectedSessionId && seg.session_id === selectedSessionId;
                  const isFirstOfSession = selectedSessionId &&
                    seg.session_id === selectedSessionId &&
                    transcription.findIndex(t => t.session_id === selectedSessionId) === transcription.indexOf(seg);

                  return (
                    <div
                      key={seg.segment_order}
                      ref={isFirstOfSession ? highlightRef : undefined}
                      className={`text-sm leading-relaxed rounded-lg transition-colors ${
                        isHighlighted
                          ? 'bg-sky-500/10 text-white px-2 py-1 -mx-2'
                          : 'text-slate-200'
                      }`}
                    >
                      <span className="text-slate-500 text-xs mr-2">
                        {seg.clock_time
                          ? formatClockTime(seg.clock_time)
                          : formatTime(seg.timestamp_seconds)
                        }
                      </span>
                      {seg.content}
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            <div>
              {!currentTemplate ? (
                <p className="text-slate-500 text-center">템플릿 데이터가 없습니다</p>
              ) : currentTemplate.status === 'processing' ? (
                <div className="text-center text-slate-400 py-10">
                  <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <p>{TEMPLATE_LABELS[selectedTemplate]} 생성 중입니다...</p>
                </div>
              ) : currentTemplate.status === 'failed' ? (
                <div className="text-center py-10">
                  <p className="text-red-400">템플릿 생성에 실패했습니다</p>
                  {currentTemplate.error_message && (
                    <p className="text-slate-500 text-sm mt-2">{currentTemplate.error_message}</p>
                  )}
                </div>
              ) : (
                <div
                  className="prose prose-invert prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: markdownToHtml(currentTemplate.content || '') }}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* 삭제 확인 다이얼로그 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-slate-800 rounded-2xl p-6 max-w-sm w-full mx-4">
            <p className="text-white text-sm mb-4">이 세션을 삭제하시겠습니까?</p>
            <p className="text-slate-400 text-xs mb-4">해당 세션의 전사 데이터가 모두 삭제됩니다.</p>
            <div className="flex gap-2">
              <button
                onClick={() => handleDeleteSession(showDeleteConfirm)}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white text-sm py-2 rounded-lg transition-colors"
              >
                삭제
              </button>
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white text-sm py-2 rounded-lg transition-colors"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatClockTime(isoString: string): string {
  const date = new Date(isoString);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// 간단한 마크다운 → HTML 변환
function markdownToHtml(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- \[ \] (.+)$/gm, '<li class="list-none">☐ $1</li>')
    .replace(/^- \[x\] (.+)$/gm, '<li class="list-none">☑ $1</li>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>');
}

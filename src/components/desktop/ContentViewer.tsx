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
  id: string;
  content: string;
  timestamp_seconds: number;
  segment_order: number;
  session_id?: string | null;
  clock_time?: string | null;
}

const TEMPLATE_TYPES: TemplateType[] = ['card_news', 'meeting_minutes'];

export default function ContentViewer({ projectId }: ContentViewerProps) {
  const [viewMode, setViewMode] = useState<'raw' | 'template'>('template');
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType>('card_news');
  const [templates, setTemplates] = useState<TemplateData[]>([]);
  const [transcription, setTranscription] = useState<TranscriptionData[]>([]);
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set());
  const [isApplying, setIsApplying] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const hasPendingDeletes = pendingDeletes.size > 0;

  const fetchData = useCallback(async (isInitial: boolean) => {
    try {
      const res = await fetch(`/api/templates/${projectId}`);
      const data = await res.json();
      setTemplates(data.templates || []);
      setTranscription(data.transcription || []);
    } catch (err) {
      console.error('데이터 로드 실패:', err);
    } finally {
      if (isInitial) setInitialLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    setInitialLoading(true);
    setPendingDeletes(new Set());
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

  // 세그먼트 삭제 표시 토글
  const toggleDelete = useCallback((segId: string) => {
    setPendingDeletes(prev => {
      const next = new Set(prev);
      if (next.has(segId)) {
        next.delete(segId);
      } else {
        next.add(segId);
      }
      return next;
    });
  }, []);

  // 전체 복원
  const restoreAll = useCallback(() => {
    setPendingDeletes(new Set());
  }, []);

  // 갱신 적용: 서버에서 삭제 + 부분 재생성
  const handleApply = useCallback(async () => {
    if (pendingDeletes.size === 0) return;
    setIsApplying(true);

    try {
      // 1. 삭제할 세그먼트의 내용 수집 (부분 재생성용)
      const deletedSegments = transcription.filter(s => pendingDeletes.has(s.id));
      const segmentIds = deletedSegments.map(s => s.id);

      // 2. 서버에서 세그먼트 삭제
      const deleteRes = await fetch('/api/transcription', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segmentIds }),
      });

      if (!deleteRes.ok) {
        console.error('세그먼트 삭제 실패');
        return;
      }

      const { removedContent } = await deleteRes.json();

      // 3. 기존 템플릿 수집
      const existingTemplates: Record<string, string> = {};
      for (const t of templates) {
        if (t.content) {
          existingTemplates[t.template_type] = t.content;
        }
      }

      // 4. 부분 재생성 트리거
      if (Object.keys(existingTemplates).length > 0 && removedContent) {
        await fetch('/api/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            mode: 'update',
            removedContent,
            existingTemplates,
          }),
        });

        // 폴링 재시작
        if (pollingRef.current) clearInterval(pollingRef.current);
        pollingRef.current = setInterval(() => fetchData(false), 10000);
      }

      // 5. UI 초기화 + 데이터 갱신
      setPendingDeletes(new Set());
      await fetchData(false);
    } catch (err) {
      console.error('갱신 적용 실패:', err);
    } finally {
      setIsApplying(false);
    }
  }, [pendingDeletes, transcription, templates, projectId, fetchData]);

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
          {isApplying && (
            <span className="text-blue-400 text-sm animate-pulse">
              갱신 적용 중...
            </span>
          )}
        </div>
      </div>

      {/* 삭제 대기 배너 */}
      {hasPendingDeletes && !isProcessing && (
        <div className="flex items-center justify-between bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-4 py-2 mb-4">
          <span className="text-yellow-400 text-sm">
            {pendingDeletes.size}개 세그먼트 삭제 예정
          </span>
          <div className="flex gap-2">
            <button
              onClick={restoreAll}
              className="px-3 py-1 bg-slate-600 hover:bg-slate-500 text-white text-sm rounded-lg transition-colors"
            >
              전체 복원
            </button>
            <button
              onClick={handleApply}
              disabled={isApplying}
              className="px-3 py-1 bg-yellow-500 hover:bg-yellow-600 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
            >
              갱신 적용
            </button>
          </div>
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
      <div className="flex-1 overflow-y-auto bg-slate-800 rounded-xl p-6 min-h-0">
        {viewMode === 'raw' ? (
          <div className="space-y-1">
            {transcription.length === 0 ? (
              <p className="text-slate-500 text-center">전사 데이터가 없습니다</p>
            ) : (
              transcription.map((seg) => {
                const isDeleted = pendingDeletes.has(seg.id);

                return (
                  <div
                    key={seg.id}
                    className={`group flex items-start gap-2 py-1.5 px-2 -mx-2 rounded-lg transition-colors ${
                      isDeleted
                        ? 'bg-red-500/5 opacity-50'
                        : 'hover:bg-slate-700/50'
                    }`}
                  >
                    {/* 타임스탬프 + 내용 */}
                    <div className="flex-1 text-sm leading-relaxed">
                      <span className="text-slate-500 text-xs mr-2">
                        {seg.clock_time
                          ? formatClockTime(seg.clock_time)
                          : formatTime(seg.timestamp_seconds)
                        }
                      </span>
                      <span className={isDeleted ? 'line-through text-slate-500' : 'text-slate-200'}>
                        {seg.content}
                      </span>
                    </div>

                    {/* 삭제/복원 버튼 */}
                    <button
                      onClick={() => toggleDelete(seg.id)}
                      className={`flex-shrink-0 px-2 py-0.5 rounded text-xs transition-all ${
                        isDeleted
                          ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                          : 'opacity-0 group-hover:opacity-100 bg-red-500/20 text-red-400 hover:bg-red-500/30'
                      }`}
                    >
                      {isDeleted ? '복원' : '삭제'}
                    </button>
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

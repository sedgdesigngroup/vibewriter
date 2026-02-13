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
}

interface TranscriptionData {
  content: string;
  timestamp_seconds: number;
  segment_order: number;
}

const TEMPLATE_TYPES: TemplateType[] = ['card_news', 'meeting_minutes'];

export default function ContentViewer({ projectId }: ContentViewerProps) {
  const [viewMode, setViewMode] = useState<'raw' | 'template'>('template');
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType>('card_news');
  const [templates, setTemplates] = useState<TemplateData[]>([]);
  const [transcription, setTranscription] = useState<TranscriptionData[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // 초기 로드 + 폴링
  useEffect(() => {
    setInitialLoading(true);
    fetchData(true);

    pollingRef.current = setInterval(() => fetchData(false), 10000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [fetchData]);

  const isProcessing = templates.some(t => t.status === 'processing' || t.status === 'pending');
  const currentTemplate = templates.find(t => t.template_type === selectedTemplate);

  // 모든 템플릿 처리 완료 시 폴링 중지
  useEffect(() => {
    if (!isProcessing && templates.length > 0 && pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, [isProcessing, templates.length]);

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

        {isProcessing && (
          <span className="text-blue-400 text-sm animate-pulse">
            템플릿 생성 중...
          </span>
        )}
      </div>

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
      <div className="flex-1 overflow-y-auto bg-slate-800 rounded-xl p-6">
        {viewMode === 'raw' ? (
          // 원문 표시
          <div className="space-y-3">
            {transcription.length === 0 ? (
              <p className="text-slate-500 text-center">전사 데이터가 없습니다</p>
            ) : (
              transcription.map((seg) => (
                <div key={seg.segment_order} className="text-slate-200 text-sm leading-relaxed">
                  <span className="text-slate-500 text-xs mr-2">
                    {formatTime(seg.timestamp_seconds)}
                  </span>
                  {seg.content}
                </div>
              ))
            )}
          </div>
        ) : (
          // 템플릿 표시
          <div>
            {!currentTemplate ? (
              <p className="text-slate-500 text-center">템플릿 데이터가 없습니다</p>
            ) : currentTemplate.status === 'processing' ? (
              <div className="text-center text-slate-400 py-10">
                <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p>{TEMPLATE_LABELS[selectedTemplate]} 생성 중입니다...</p>
              </div>
            ) : currentTemplate.status === 'failed' ? (
              <p className="text-red-400 text-center">템플릿 생성에 실패했습니다</p>
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

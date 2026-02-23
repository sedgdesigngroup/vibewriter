"use client";

import { useState } from 'react';
import type { Project } from '@/types';

interface ProjectListProps {
  projects: Project[];
  selectedProjectId: string | null;
  onSelect: (project: Project) => void;
  onDelete?: (projectId: string) => void;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  recording: { label: '녹음 중', color: 'bg-yellow-500' },
  processing: { label: '처리 중', color: 'bg-blue-500' },
  completed: { label: '완료', color: 'bg-green-500' },
  failed: { label: '실패', color: 'bg-red-500' },
};

export default function ProjectList({ projects, selectedProjectId, onSelect, onDelete }: ProjectListProps) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (projectId: string) => {
    setDeletingId(projectId);
    try {
      const res = await fetch(`/api/projects?projectId=${projectId}`, { method: 'DELETE' });
      if (res.ok) {
        setConfirmId(null);
        onDelete?.(projectId);
      }
    } catch (err) {
      console.error('프로젝트 삭제 오류:', err);
    } finally {
      setDeletingId(null);
    }
  };

  if (projects.length === 0) {
    return (
      <div className="text-slate-500 text-sm text-center py-4">
        해당 날짜에 프로젝트가 없습니다
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {projects.map((project) => {
        const status = STATUS_LABELS[project.status] || STATUS_LABELS.recording;
        const isSelected = project.id === selectedProjectId;
        const duration = project.total_duration_seconds
          ? formatDuration(project.total_duration_seconds)
          : '-';
        const isConfirming = confirmId === project.id;

        return (
          <div key={project.id} className="relative group">
            <button
              onClick={() => onSelect(project)}
              className={`
                w-full text-left p-3 rounded-xl transition-colors
                ${isSelected ? 'bg-sky-500/20 border border-sky-500/50' : 'bg-slate-700 hover:bg-slate-600 border border-transparent'}
              `}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-white text-sm font-medium">{project.file_name}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs text-white ${status.color}`}>
                  {status.label}
                </span>
              </div>
              <div className="text-slate-400 text-xs">
                녹음 시간: {duration}
              </div>
            </button>

            {/* 삭제 버튼 (호버 시 표시) */}
            {!isConfirming && (
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmId(project.id); }}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all text-xs"
                title="삭제"
              >
                ✕
              </button>
            )}

            {/* 삭제 확인 오버레이 */}
            {isConfirming && (
              <div className="absolute inset-0 bg-slate-900/90 rounded-xl flex items-center justify-center gap-2 z-10">
                <span className="text-slate-300 text-xs">삭제할까요?</span>
                <button
                  onClick={() => handleDelete(project.id)}
                  disabled={deletingId === project.id}
                  className="px-2 py-1 bg-red-500 hover:bg-red-600 text-white text-xs rounded-lg disabled:opacity-50"
                >
                  {deletingId === project.id ? '...' : '삭제'}
                </button>
                <button
                  onClick={() => setConfirmId(null)}
                  className="px-2 py-1 bg-slate-600 hover:bg-slate-500 text-white text-xs rounded-lg"
                >
                  취소
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}시간 ${m}분`;
  if (m > 0) return `${m}분 ${s}초`;
  return `${s}초`;
}

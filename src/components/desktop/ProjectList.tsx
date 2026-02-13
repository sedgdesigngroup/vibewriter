"use client";

import type { Project } from '@/types';

interface ProjectListProps {
  projects: Project[];
  selectedProjectId: string | null;
  onSelect: (project: Project) => void;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  recording: { label: '녹음 중', color: 'bg-yellow-500' },
  processing: { label: '처리 중', color: 'bg-blue-500' },
  completed: { label: '완료', color: 'bg-green-500' },
  failed: { label: '실패', color: 'bg-red-500' },
};

export default function ProjectList({ projects, selectedProjectId, onSelect }: ProjectListProps) {
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

        return (
          <button
            key={project.id}
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

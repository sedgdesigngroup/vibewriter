"use client";

import { useState, useEffect, useMemo } from 'react';
import Calendar from './Calendar';
import ProjectList from './ProjectList';
import ContentViewer from './ContentViewer';
import type { Project } from '@/types';

interface ResultsViewProps {
  userId: string;
  onLogout: () => void;
}

export default function ResultsView({ userId, onLogout }: ResultsViewProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  // 프로젝트 목록 조회
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const res = await fetch(`/api/projects?userId=${encodeURIComponent(userId)}`);
        const data = await res.json();
        setProjects(data.projects || []);
      } catch (err) {
        console.error('프로젝트 로드 실패:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();
  }, [userId]);

  // 프로젝트가 있는 날짜 Set
  const projectDates = useMemo(() => {
    return new Set(projects.map(p => p.date));
  }, [projects]);

  // 선택된 날짜의 프로젝트들
  const dateProjects = useMemo(() => {
    if (!selectedDate) return [];
    return projects.filter(p => p.date === selectedDate);
  }, [projects, selectedDate]);

  const handleDateSelect = (date: string) => {
    setSelectedDate(date);
    setSelectedProject(null);
  };

  return (
    <div className="flex h-screen bg-slate-900">
      {/* 좌측 패널: 캘린더 + 프로젝트 목록 */}
      <div className="w-80 border-r border-slate-700 flex flex-col p-4 overflow-y-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-bold text-white">바이브라이팅</h1>
          <button
            onClick={onLogout}
            className="text-slate-400 hover:text-white text-sm transition-colors"
          >
            로그아웃
          </button>
        </div>

        <p className="text-slate-400 text-sm mb-4">
          안녕하세요, <span className="text-sky-400">{userId}</span>님
        </p>

        {/* 캘린더 */}
        <Calendar
          projectDates={projectDates}
          onDateSelect={handleDateSelect}
          selectedDate={selectedDate}
        />

        {/* 선택된 날짜의 프로젝트 목록 */}
        {selectedDate && (
          <div className="mt-4">
            <h2 className="text-slate-400 text-sm mb-2">
              {selectedDate} 프로젝트
            </h2>
            {loading ? (
              <p className="text-slate-500 text-sm">로딩 중...</p>
            ) : (
              <ProjectList
                projects={dateProjects}
                selectedProjectId={selectedProject?.id || null}
                onSelect={setSelectedProject}
              />
            )}
          </div>
        )}
      </div>

      {/* 우측 패널: 콘텐츠 뷰어 */}
      <div className="flex-1 p-6">
        {selectedProject ? (
          <ContentViewer projectId={selectedProject.id} />
        ) : (
          <div className="flex items-center justify-center h-full text-slate-500">
            <div className="text-center">
              <p className="text-lg mb-2">프로젝트를 선택해주세요</p>
              <p className="text-sm">캘린더에서 날짜를 선택하고, 프로젝트를 클릭하세요</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

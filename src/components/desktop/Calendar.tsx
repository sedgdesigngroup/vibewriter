"use client";

import { useState, useMemo } from 'react';

interface CalendarProps {
  projectDates: Set<string>; // 'YYYY-MM-DD' 형식
  onDateSelect: (date: string) => void;
  selectedDate: string | null;
}

export default function Calendar({ projectDates, onDateSelect, selectedDate }: CalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const weeks = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const days: { date: string; day: number; isCurrentMonth: boolean }[] = [];

    // 이전 달
    for (let i = firstDay - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({ date: dateStr, day: d, isCurrentMonth: false });
    }

    // 현재 달
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({ date: dateStr, day: d, isCurrentMonth: true });
    }

    // 다음 달 (6주 채우기)
    const remaining = 42 - days.length;
    for (let d = 1; d <= remaining; d++) {
      const dateStr = `${year}-${String(month + 2).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({ date: dateStr, day: d, isCurrentMonth: false });
    }

    // 주 단위로 분할
    const result: typeof days[] = [];
    for (let i = 0; i < days.length; i += 7) {
      result.push(days.slice(i, i + 7));
    }
    return result;
  }, [year, month]);

  const monthLabel = `${year}년 ${month + 1}월`;

  return (
    <div className="bg-slate-800 rounded-2xl p-4">
      {/* 네비게이션 */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={prevMonth}
          className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-white font-medium">{monthLabel}</span>
        <button
          onClick={nextMonth}
          className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 mb-2">
        {['일', '월', '화', '수', '목', '금', '토'].map((day) => (
          <div key={day} className="text-center text-slate-500 text-xs py-1">
            {day}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7">
          {week.map((d) => {
            const hasProject = projectDates.has(d.date);
            const isSelected = d.date === selectedDate;

            return (
              <button
                key={d.date}
                onClick={() => d.isCurrentMonth && onDateSelect(d.date)}
                disabled={!d.isCurrentMonth}
                className={`
                  relative p-2 text-center text-sm rounded-lg transition-colors
                  ${!d.isCurrentMonth ? 'text-slate-600 cursor-default' : 'hover:bg-slate-700 cursor-pointer'}
                  ${d.isCurrentMonth && !isSelected ? 'text-slate-300' : ''}
                  ${isSelected ? 'bg-sky-500 text-white' : ''}
                `}
              >
                {d.day}
                {hasProject && !isSelected && (
                  <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-sky-400" />
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

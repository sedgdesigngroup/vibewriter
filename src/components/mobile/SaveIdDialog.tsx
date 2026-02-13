"use client";

import { useState, useEffect } from 'react';

const STORAGE_KEY = 'vibe-writing-userId';

interface SaveIdDialogProps {
  isOpen: boolean;
  onSave: (userId: string) => void;
  onClose: () => void;
  isSaving: boolean;
}

export default function SaveIdDialog({ isOpen, onSave, onClose, isSaving }: SaveIdDialogProps) {
  const [userId, setUserId] = useState('');

  // localStorage에서 저장된 아이디 불러오기
  useEffect(() => {
    if (isOpen) {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setUserId(saved);
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (!userId.trim()) return;
    // 아이디를 기기에 저장 (다음부터 자동 입력)
    localStorage.setItem(STORAGE_KEY, userId.trim());
    onSave(userId.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-slate-800 rounded-2xl p-6 mx-4 max-w-sm w-full shadow-xl">
        <h2 className="text-white text-lg font-bold mb-4">저장하기</h2>

        {/* 아이디 입력 */}
        <div className="mb-4">
          <label className="text-slate-400 text-sm mb-1 block">아이디</label>
          <input
            type="text"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="아이디를 입력해주세요"
            className="w-full px-4 py-3 rounded-xl bg-slate-700 text-white placeholder-slate-500
                       border border-slate-600 focus:border-sky-500 focus:outline-none"
            disabled={isSaving}
          />
          <p className="text-slate-500 text-xs mt-1">
            처음이면 자동으로 계정이 만들어집니다
          </p>
        </div>

        {/* 안내 문구 */}
        <p className="text-slate-400 text-xs mb-4">
          저장 시, 대화 내용과 시간대가 구분되어 저장됩니다.
          4가지 템플릿(카드뉴스, 짧은소설, 핵심+해설, 회의록)이 자동으로 생성됩니다.
        </p>

        {/* 템플릿 미리보기 */}
        <div className="flex flex-wrap gap-2 mb-6">
          {['카드 뉴스', '짧은 소설', '핵심+해설', '회의록'].map((label) => (
            <span
              key={label}
              className="px-3 py-1 rounded-full bg-sky-500/20 text-sky-400 text-xs"
            >
              {label}
            </span>
          ))}
        </div>

        {/* 버튼 */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="flex-1 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors
                       disabled:opacity-50"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={!userId.trim() || isSaving}
            className="flex-1 py-3 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-medium transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

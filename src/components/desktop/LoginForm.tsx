"use client";

import { useState } from 'react';

interface LoginFormProps {
  onLogin: (userId: string) => void;
}

export default function LoginForm({ onLogin }: LoginFormProps) {
  const [userId, setUserId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId.trim()) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userId.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || '로그인에 실패했습니다');
        return;
      }

      onLogin(data.user.user_id);
    } catch {
      setError('서버 연결에 실패했습니다');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900">
      <div className="w-full max-w-md mx-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">바이브라이팅</h1>
          <p className="text-slate-400">녹음 결과를 확인하려면 로그인해주세요</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-slate-800 rounded-2xl p-8 shadow-xl">
          <div className="mb-6">
            <label htmlFor="userId" className="block text-slate-400 text-sm mb-2">
              아이디
            </label>
            <input
              id="userId"
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="아이디를 입력해주세요"
              className="w-full px-4 py-3 rounded-xl bg-slate-700 text-white placeholder-slate-500
                         border border-slate-600 focus:border-sky-500 focus:outline-none"
              disabled={loading}
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm mb-4 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={!userId.trim() || loading}
            className="w-full py-3 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-medium
                       transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '확인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  );
}

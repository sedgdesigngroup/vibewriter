"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import LoginForm from '@/components/desktop/LoginForm';

const STORAGE_KEY = 'vibe-writing-userId';

export default function LoginPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  // 저장된 아이디가 있으면 자동 로그인
  useEffect(() => {
    const savedUserId = localStorage.getItem(STORAGE_KEY);
    if (savedUserId) {
      router.replace(`/results?userId=${encodeURIComponent(savedUserId)}`);
    } else {
      setChecking(false);
    }
  }, [router]);

  const handleLogin = (userId: string) => {
    localStorage.setItem(STORAGE_KEY, userId);
    router.push(`/results?userId=${encodeURIComponent(userId)}`);
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900">
        <p className="text-slate-400">로그인 확인 중...</p>
      </div>
    );
  }

  return <LoginForm onLogin={handleLogin} />;
}

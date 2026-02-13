"use client";

import { useSearchParams, useRouter } from 'next/navigation';
import { Suspense } from 'react';
import ResultsView from '@/components/desktop/ResultsView';

function ResultsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const userId = searchParams.get('userId');

  if (!userId) {
    router.replace('/login');
    return null;
  }

  const handleLogout = () => {
    localStorage.removeItem('vibe-writing-userId');
    router.replace('/login');
  };

  return <ResultsView userId={userId} onLogout={handleLogout} />;
}

export default function ResultsPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-slate-900 text-slate-400">
        로딩 중...
      </div>
    }>
      <ResultsContent />
    </Suspense>
  );
}

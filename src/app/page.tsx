"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const STORAGE_KEY = 'vibe-writing-userId';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (window.innerWidth <= 768 && 'ontouchstart' in window);

    if (isMobile) {
      router.replace("/record");
    } else {
      // 데스크톱: 저장된 아이디가 있으면 바로 결과 뷰어로
      const savedUserId = localStorage.getItem(STORAGE_KEY);
      if (savedUserId) {
        router.replace(`/results?userId=${encodeURIComponent(savedUserId)}`);
      } else {
        router.replace("/login");
      }
    }
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-white mb-2">바이브라이팅</h1>
        <p className="text-slate-400">잠시만 기다려주세요...</p>
      </div>
    </div>
  );
}

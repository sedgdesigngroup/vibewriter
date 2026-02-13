"use client";

import { useState } from 'react';
import RecordingView from '@/components/mobile/RecordingView';
import AllDayRecordingView from '@/components/mobile/AllDayRecordingView';

export default function RecordPage() {
  const [mode, setMode] = useState<'normal' | 'allday'>('normal');

  if (mode === 'allday') {
    return <AllDayRecordingView onSwitchMode={() => setMode('normal')} />;
  }
  return <RecordingView onSwitchMode={() => setMode('allday')} />;
}

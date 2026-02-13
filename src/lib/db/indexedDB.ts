import { openDB, type IDBPDatabase } from 'idb';
import type { TranscriptionSegment, AllDaySession } from '@/types';

const DB_NAME = 'vibe-writing';
const DB_VERSION = 2;
const STORE_NAME = 'transcriptions';
const ALLDAY_STORE = 'allday_sessions';

async function getDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // v1: 기존 transcriptions 스토어
      if (oldVersion < 1) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('sessionId', 'sessionId');
        store.createIndex('order', 'order');
      }
      // v2: 하루종일 세션 스토어
      if (oldVersion < 2) {
        const alldayStore = db.createObjectStore(ALLDAY_STORE, { keyPath: 'id' });
        alldayStore.createIndex('startDate', 'startDate');
        alldayStore.createIndex('status', 'status');
      }
    },
  });
}

// ─── 기존 세그먼트 CRUD (변경 없음) ───

export async function saveSegment(segment: TranscriptionSegment): Promise<void> {
  const db = await getDB();
  await db.put(STORE_NAME, segment);
}

export async function getSegmentsBySession(sessionId: string): Promise<TranscriptionSegment[]> {
  const db = await getDB();
  const segments = await db.getAllFromIndex(STORE_NAME, 'sessionId', sessionId);
  return segments.sort((a, b) => a.order - b.order);
}

export async function getUnsavedSegments(sessionId: string): Promise<TranscriptionSegment[]> {
  const segments = await getSegmentsBySession(sessionId);
  return segments.filter(s => !s.savedToServer);
}

export async function markSegmentsAsSaved(ids: string[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  for (const id of ids) {
    const segment = await tx.store.get(id);
    if (segment) {
      segment.savedToServer = true;
      await tx.store.put(segment);
    }
  }
  await tx.done;
}

export async function clearSession(sessionId: string): Promise<void> {
  const db = await getDB();
  const segments = await db.getAllFromIndex(STORE_NAME, 'sessionId', sessionId);
  const tx = db.transaction(STORE_NAME, 'readwrite');
  for (const segment of segments) {
    await tx.store.delete(segment.id);
  }
  await tx.done;
}

export async function getAllSessions(): Promise<string[]> {
  const db = await getDB();
  const all = await db.getAll(STORE_NAME);
  const sessions = new Set(all.map(s => s.sessionId));
  return Array.from(sessions);
}

// ─── 하루종일 세션 CRUD ───

export async function saveAllDaySession(session: AllDaySession): Promise<void> {
  const db = await getDB();
  await db.put(ALLDAY_STORE, session);
}

export async function getActiveAllDaySession(): Promise<AllDaySession | null> {
  const db = await getDB();
  const sessions = await db.getAllFromIndex(ALLDAY_STORE, 'status', 'active');
  return sessions.length > 0 ? (sessions[0] as AllDaySession) : null;
}

export async function getAllDaySessionsByDate(date: string): Promise<AllDaySession[]> {
  const db = await getDB();
  const sessions = await db.getAllFromIndex(ALLDAY_STORE, 'startDate', date);
  return sessions as AllDaySession[];
}

export async function clearAllDaySession(sessionId: string): Promise<void> {
  const db = await getDB();
  await db.delete(ALLDAY_STORE, sessionId);
}

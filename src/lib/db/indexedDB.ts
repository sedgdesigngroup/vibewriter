import { openDB, type IDBPDatabase } from 'idb';
import type { TranscriptionSegment } from '@/types';

const DB_NAME = 'vibe-writing';
const DB_VERSION = 1;
const STORE_NAME = 'transcriptions';

async function getDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('sessionId', 'sessionId');
        store.createIndex('order', 'order');
      }
    },
  });
}

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

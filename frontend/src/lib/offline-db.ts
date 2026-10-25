import { z } from 'zod';

const DB_NAME = 'cbt_pro_offline_db';
const DB_VERSION = 1;
const STORE_PAPERS = 'exam_papers';
const STORE_QUEUE = 'pending_answer_mutations';

export type AnswerSyncState =
  | 'SAVED_ON_SERVER'
  | 'SAVED_LOCAL_PENDING_SYNC'
  | 'SYNC_IN_PROGRESS'
  | 'SYNC_FAILED';

export const PendingAnswerMutationSchema = z.object({
  idempotencyKey: z.string().min(4),
  participantId: z.string().min(4),
  questionId: z.string().min(4),
  answerPayload: z.record(z.any()),
  isMarkedForReview: z.boolean(),
  expectedVersion: z.number().int().nonnegative().optional(),
  clientUpdatedAt: z.string(),
  retryCount: z.number().int().nonnegative().default(0),
});

export type PendingAnswerMutation = z.infer<typeof PendingAnswerMutationSchema>;

function openOfflineIndexedDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PAPERS)) {
        db.createObjectStore(STORE_PAPERS, { keyPath: 'participantId' });
      }
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        const qStore = db.createObjectStore(STORE_QUEUE, { keyPath: 'idempotencyKey' });
        qStore.createIndex('by_participant', 'participantId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

export async function savePaperToIndexedDb(participantId: string, paperData: any): Promise<void> {
  const db = await openOfflineIndexedDb();
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_PAPERS, 'readwrite');
    tx.objectStore(STORE_PAPERS).put({
      participantId,
      paperData,
      cachedAt: new Date().toISOString(),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

export async function loadPaperFromIndexedDb(participantId: string): Promise<any | null> {
  const db = await openOfflineIndexedDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_PAPERS, 'readonly');
    const req = tx.objectStore(STORE_PAPERS).get(participantId);
    req.onsuccess = () => resolve(req.result?.paperData || null);
    req.onerror = () => resolve(null);
  });
}

export async function enqueueOfflineAnswerMutation(rawMutation: PendingAnswerMutation): Promise<void> {
  const parsed = PendingAnswerMutationSchema.parse(rawMutation);
  const db = await openOfflineIndexedDb();
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_QUEUE, 'readwrite');
    tx.objectStore(STORE_QUEUE).put(parsed);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

export async function listQueuedMutationsForParticipant(
  participantId: string,
): Promise<PendingAnswerMutation[]> {
  const db = await openOfflineIndexedDb();
  if (!db) return [];
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_QUEUE, 'readonly');
    const idx = tx.objectStore(STORE_QUEUE).index('by_participant');
    const req = idx.getAll(IDBKeyRange.only(participantId));
    req.onsuccess = () => {
      const items = Array.isArray(req.result) ? req.result : [];
      const validated: PendingAnswerMutation[] = [];
      for (const item of items) {
        const res = PendingAnswerMutationSchema.safeParse(item);
        if (res.success) {
          validated.push(res.data);
        }
      }
      validated.sort(
        (a, b) => new Date(a.clientUpdatedAt).getTime() - new Date(b.clientUpdatedAt).getTime(),
      );
      resolve(validated);
    };
    req.onerror = () => resolve([]);
  });
}

export async function removeQueuedMutations(idempotencyKeys: string[]): Promise<void> {
  if (idempotencyKeys.length === 0) return;
  const db = await openOfflineIndexedDb();
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_QUEUE, 'readwrite');
    const store = tx.objectStore(STORE_QUEUE);
    for (const k of idempotencyKeys) {
      store.delete(k);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

/**
 * Exponential backoff with jitter (Section 8 & 13)
 */
export function computeBackoffWithJitterMs(attempt: number): number {
  const cappedAttempt = Math.min(6, Math.max(0, attempt));
  const baseMs = 1000 * Math.pow(2, cappedAttempt);
  const jitterMs = Math.floor(Math.random() * 500);
  return baseMs + jitterMs;
}

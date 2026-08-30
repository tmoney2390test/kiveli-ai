import type { Snapshot } from '../types';

const CACHE_VERSION = 1;
const CACHE_TTL_MS = 30 * 60_000;
const MAX_CACHE_BYTES = 4_500_000;

type SnapshotCacheEnvelope = { version: number; userId: string; savedAt: number; snapshot: Snapshot };

export function sessionSnapshotCacheKey(userId: string): string {
  return `kivelle:session-snapshot:v${CACHE_VERSION}:${userId}`;
}

export function serializeSessionSnapshot(userId: string, snapshot: Snapshot, savedAt = Date.now()): string | null {
  try {
    const value = JSON.stringify({ version: CACHE_VERSION, userId, savedAt, snapshot } satisfies SnapshotCacheEnvelope);
    return value.length <= MAX_CACHE_BYTES ? value : null;
  } catch {
    return null;
  }
}

export function parseSessionSnapshot(raw: string | null, userId: string, now = Date.now()): Snapshot | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<SnapshotCacheEnvelope>;
    if (value.version !== CACHE_VERSION || value.userId !== userId || !value.savedAt || now - value.savedAt > CACHE_TTL_MS || now < value.savedAt) return null;
    const snapshot = value.snapshot;
    if (!snapshot || !Array.isArray(snapshot.worlds) || !Array.isArray(snapshot.characters) || !Array.isArray(snapshot.conversations)) return null;
    return snapshot;
  } catch {
    return null;
  }
}

export function readSessionSnapshot(userId: string): Snapshot | null {
  if (typeof window === 'undefined' || !window.sessionStorage) return null;
  const key = sessionSnapshotCacheKey(userId);
  const snapshot = parseSessionSnapshot(window.sessionStorage.getItem(key), userId);
  if (!snapshot) window.sessionStorage.removeItem(key);
  return snapshot;
}

export function writeSessionSnapshot(userId: string, snapshot: Snapshot): boolean {
  if (typeof window === 'undefined' || !window.sessionStorage) return false;
  const value = serializeSessionSnapshot(userId, snapshot);
  if (!value) return false;
  try {
    window.sessionStorage.setItem(sessionSnapshotCacheKey(userId), value);
    return true;
  } catch {
    return false;
  }
}

export function clearSessionSnapshot(userId: string): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  window.sessionStorage.removeItem(sessionSnapshotCacheKey(userId));
}

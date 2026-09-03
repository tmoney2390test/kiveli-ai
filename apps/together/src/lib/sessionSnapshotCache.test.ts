import { describe, expect, it } from 'vitest';
import type { Snapshot } from '../types';
import { parseSessionSnapshot, serializeSessionSnapshot, sessionSnapshotCacheKey } from './sessionSnapshotCache';

const snapshot = { worlds: [], characters: [], conversations: [] } as unknown as Snapshot;

describe('session snapshot cache', () => {
  it('restores a fresh cache only for the same authenticated user', () => {
    const raw = serializeSessionSnapshot('user-1', snapshot, 1000);
    expect(parseSessionSnapshot(raw, 'user-1', 1500)).toEqual(snapshot);
    expect(parseSessionSnapshot(raw, 'user-2', 1500)).toBeNull();
  });

  it('expires cached world data after thirty minutes and rejects malformed entries', () => {
    const raw = serializeSessionSnapshot('user-1', snapshot, 1000);
    expect(parseSessionSnapshot(raw, 'user-1', 1000 + 30 * 60_000 + 1)).toBeNull();
    expect(parseSessionSnapshot('{"version":1}', 'user-1', 1500)).toBeNull();
  });

  it('uses a versioned user-scoped key', () => {
    expect(sessionSnapshotCacheKey('abc')).toBe('kivelle:session-snapshot:v2:abc');
  });
});

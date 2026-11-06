import { afterEach, describe, expect, it } from 'vitest';
import type { Snapshot } from '../types';
import {
  clearSessionSnapshot,
  parseSessionSnapshot,
  readSessionHeroUri,
  readSessionSnapshot,
  serializeSessionSnapshot,
  sessionSnapshotCacheKey,
  writeSessionHeroUri,
  writeSessionSnapshot,
} from './sessionSnapshotCache';

const snapshot = { worlds: [], characters: [], conversations: [] } as unknown as Snapshot;

describe('session snapshot cache', () => {
  afterEach(() => Reflect.deleteProperty(globalThis, 'window'));
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

  it('continues without cached data when the browser denies session storage', async () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { get sessionStorage() { throw new Error('Storage blocked'); } },
    });
    await expect(readSessionSnapshot('user-1')).resolves.toBeNull();
    await expect(writeSessionSnapshot('user-1', snapshot)).resolves.toBe(false);
    expect(readSessionHeroUri('user-1')).toBeNull();
    expect(writeSessionHeroUri('user-1', '/hero.jpg')).toBe(false);
    expect(() => clearSessionSnapshot('user-1')).not.toThrow();
  });

  it('continues when an available storage object rejects reads and removals', async () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { sessionStorage: {
        getItem() { throw new Error('Read blocked'); },
        removeItem() { throw new Error('Removal blocked'); },
        setItem() { throw new Error('Write blocked'); },
      } },
    });
    await expect(readSessionSnapshot('user-1')).resolves.toBeNull();
    await expect(writeSessionSnapshot('user-1', snapshot)).resolves.toBe(false);
    expect(readSessionHeroUri('user-1')).toBeNull();
    expect(writeSessionHeroUri('user-1', '/hero.jpg')).toBe(false);
    expect(() => clearSessionSnapshot('user-1')).not.toThrow();
  });

  it('does not restore a large snapshot after sign-out while compression is finishing', async () => {
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { sessionStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        removeItem: (key: string) => { values.delete(key); },
        setItem: (key: string, value: string) => { values.set(key, value); },
      } },
    });
    const largeSnapshot = { ...snapshot, padding: 'x'.repeat(800_000) } as Snapshot;
    const write = writeSessionSnapshot('user-1', largeSnapshot);
    clearSessionSnapshot('user-1');
    await expect(write).resolves.toBe(false);
    expect(values.has(sessionSnapshotCacheKey('user-1'))).toBe(false);
  });
});

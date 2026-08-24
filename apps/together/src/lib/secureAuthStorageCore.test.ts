import { describe, expect, it } from 'vitest';
import { createChunkedSecureStorage } from './secureAuthStorageCore';

function memorySecure(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return { values, getItemAsync: (key: string) => Promise.resolve(values.get(key) ?? null), setItemAsync: (key: string, value: string) => { values.set(key, value); return Promise.resolve(); }, deleteItemAsync: (key: string) => { values.delete(key); return Promise.resolve(); } };
}

function memoryLegacy(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return { values, getItem: (key: string) => Promise.resolve(values.get(key) ?? null), setItem: (key: string, value: string) => { values.set(key, value); return Promise.resolve(); }, removeItem: (key: string) => { values.delete(key); return Promise.resolve(); } };
}

describe('native secure auth storage', () => {
  it('round-trips long Unicode Supabase sessions without splitting surrogate pairs', async () => {
    const secure = memorySecure();
    const legacy = memoryLegacy();
    const storage = createChunkedSecureStorage(secure, legacy);
    const value = JSON.stringify({ token: '🔐'.repeat(5000), refresh: 'x'.repeat(5000) });
    await storage.setItem('sb-project-auth-token', value);
    expect(await storage.getItem('sb-project-auth-token')).toBe(value);
    expect(secure.values.size).toBeGreaterThan(2);
  });

  it('migrates legacy AsyncStorage once and removes all copies on sign-out', async () => {
    const secure = memorySecure();
    const legacy = memoryLegacy({ 'sb-project-auth-token': 'legacy-session' });
    const storage = createChunkedSecureStorage(secure, legacy);
    expect(await storage.getItem('sb-project-auth-token')).toBe('legacy-session');
    expect(legacy.values.has('sb-project-auth-token')).toBe(false);
    await storage.removeItem('sb-project-auth-token');
    expect(await storage.getItem('sb-project-auth-token')).toBeNull();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isStaleWebReleaseError,
  recoverStaleWebRelease,
  staleWebAssetUrl,
  resetWebReleaseRecoveryForTests,
} from './webReleaseRecovery';

describe('web release recovery', () => {
  beforeEach(() => resetWebReleaseRecoveryForTests());

  it.each([
    'Requiring unknown module "4358".',
    "SyntaxError: Unexpected token '<'",
    'ChunkLoadError: Loading chunk 42 failed',
    'Failed to fetch dynamically imported module',
  ])('recognizes a stale deployment failure: %s', (message) => {
    expect(isStaleWebReleaseError(new Error(message))).toBe(true);
  });

  it('does not reload for ordinary application errors', () => {
    expect(isStaleWebReleaseError(new Error('The message could not be sent.'))).toBe(false);
  });

  it('recognizes a failed Expo JavaScript element without treating arbitrary assets as releases', () => {
    expect(staleWebAssetUrl({ target: { src: 'https://kivelli.app/_expo/static/js/web/entry-old.js' } } as unknown as Event)).toContain('/_expo/static/');
    expect(staleWebAssetUrl({ target: { src: 'https://kivelli.app/avatar.jpg' } } as unknown as Event)).toBeNull();
  });

  it('reloads the exact current route once and prevents a reload loop', () => {
    const values = new Map<string, string>();
    const reload = vi.fn();
    const environment = {
      now: () => 120_000,
      href: 'https://kivelli.app/chat?character=elena-petrova&conversationId=conversation-1',
      reload,
      storage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
      },
    };

    expect(recoverStaleWebRelease(new Error('Requiring unknown module "4358".'), environment)).toBe(true);
    expect(recoverStaleWebRelease(new Error('Requiring unknown module "4358".'), environment)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
    expect([...values.values()][0]).toContain(environment.href);
  });
});

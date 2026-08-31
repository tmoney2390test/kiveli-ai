import { describe, expect, it, vi } from 'vitest';
import { startSignOutTransition } from './signOutTransition';

describe('startSignOutTransition', () => {
  it('clears private state and opens sign in without waiting for session revocation', async () => {
    const events: string[] = [];
    let finishSignOut: (() => void) | undefined;
    const request = new Promise<void>((resolve) => { finishSignOut = resolve; });

    const result = startSignOutTransition({
      signOut: vi.fn(() => { events.push('revoke-started'); return request; }),
      clearPrivateState: vi.fn(() => events.push('private-state-cleared')),
      openSignIn: vi.fn(() => events.push('sign-in-opened')),
    });

    expect(events).toEqual(['revoke-started', 'private-state-cleared', 'sign-in-opened']);
    expect(await Promise.race([result.then(() => 'finished'), Promise.resolve('transitioned')])).toBe('transitioned');

    finishSignOut?.();
    await expect(result).resolves.toBeUndefined();
  });

  it('still surfaces a revocation failure after the immediate transition', async () => {
    const error = new Error('Could not revoke session');
    const result = startSignOutTransition({
      signOut: () => Promise.reject(error),
      clearPrivateState: vi.fn(),
      openSignIn: vi.fn(),
    });

    await expect(result).rejects.toBe(error);
  });
});

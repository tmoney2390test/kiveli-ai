import { describe, expect, it, vi } from 'vitest';
import {
  clearInvalidLocalSession,
  clearSessionForApiFailure,
  getValidatedPersistedSession,
  shouldClearSessionForApiFailure,
  type SessionAuthClient,
} from './authSession';

type TestSession = { access_token: string; user: { id: string } };

function authClient(input?: {
  session?: TestSession | null;
  sessionError?: { code?: string; message?: string; status?: number } | null;
  user?: object | null;
  userError?: { code?: string; message?: string; status?: number } | null;
  signOut?: () => Promise<{ error: null }>;
}) {
  return {
    getSession: vi.fn(() => Promise.resolve({
      data: { session: input?.session === undefined ? { access_token: 'valid-token', user: { id: 'user-1' } } : input.session },
      error: input?.sessionError ?? null,
    })),
    getUser: vi.fn(() => Promise.resolve({ data: { user: input?.user === undefined ? { id: 'user-1' } : input.user }, error: input?.userError ?? null })),
    signOut: vi.fn(input?.signOut ?? (() => Promise.resolve({ error: null }))),
  } satisfies SessionAuthClient<TestSession>;
}

describe('persisted auth session recovery', () => {
  it('keeps a server-validated persisted session', async () => {
    const auth = authClient();
    await expect(getValidatedPersistedSession(auth)).resolves.toMatchObject({ access_token: 'valid-token' });
    expect(auth.getUser).toHaveBeenCalledWith('valid-token');
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('clears a revoked persisted session locally and returns signed out', async () => {
    const auth = authClient({ user: null, userError: { code: 'session_not_found', status: 403 } });
    await expect(getValidatedPersistedSession(auth)).resolves.toBeNull();
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('keeps the session during a transient validation failure', async () => {
    const auth = authClient({ user: null, userError: { message: 'Failed to fetch' } });
    await expect(getValidatedPersistedSession(auth)).resolves.toMatchObject({ access_token: 'valid-token' });
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('coalesces concurrent recovery and never requests a global sign-out', async () => {
    let finish: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    const auth = authClient({ signOut: async () => { await pending; return { error: null }; } });

    const first = clearInvalidLocalSession(auth);
    const second = clearInvalidLocalSession(auth);
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    finish?.();
    await Promise.all([first, second]);
  });

  it('clears locally for protected API authentication failures', async () => {
    const auth = authClient();
    expect(shouldClearSessionForApiFailure(403, 'AUTH_REQUIRED')).toBe(true);
    await clearSessionForApiFailure(auth, 403, 'AUTH_REQUIRED');
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('does not clear the session for entitlement or transient API failures', async () => {
    const auth = authClient();
    await clearSessionForApiFailure(auth, 403, 'SUBSCRIPTION_REQUIRED');
    await clearSessionForApiFailure(auth, 503, 'SERVICE_UNAVAILABLE');
    expect(auth.signOut).not.toHaveBeenCalled();
  });
});

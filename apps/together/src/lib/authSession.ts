type AuthFailure = {
  code?: string | null;
  message?: string | null;
  status?: number | null;
};

type PersistedSession = {
  access_token: string;
};

export type SessionAuthClient<TSession extends PersistedSession = PersistedSession> = {
  getSession(): Promise<{
    data: { session: TSession | null };
    error: AuthFailure | null;
  }>;
  getUser(jwt?: string): Promise<{
    data: { user: unknown };
    error: AuthFailure | null;
  }>;
  signOut(options: { scope: 'local' }): Promise<{ error: unknown }>;
};

const invalidSessionCodes = new Set([
  'bad_jwt',
  'invalid_jwt',
  'invalid_refresh_token',
  'jwt_expired',
  'refresh_token_already_used',
  'refresh_token_not_found',
  'session_not_found',
  'user_not_found',
]);

const localSignOuts = new WeakMap<object, Promise<void>>();

export function isInvalidAuthSessionError(error: AuthFailure | null | undefined) {
  if (!error) return false;
  const code = error.code?.trim().toLowerCase();
  if (code && invalidSessionCodes.has(code)) return true;
  if (error.status === 401 || error.status === 403) return true;
  const message = error.message?.toLowerCase() ?? '';
  return message.includes('session not found')
    || message.includes('refresh token not found')
    || message.includes('invalid refresh token');
}

export function shouldClearSessionForApiFailure(status: number, code?: string | null) {
  return status === 401 || code?.toUpperCase() === 'AUTH_REQUIRED';
}

/**
 * Clears only this installation's persisted session. Never revoke other
 * devices when recovering from an invalid local token.
 */
export function clearInvalidLocalSession(auth: SessionAuthClient) {
  const key = auth as object;
  const pending = localSignOuts.get(key);
  if (pending) return pending;

  const request = auth.signOut({ scope: 'local' })
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => {
      if (localSignOuts.get(key) === request) localSignOuts.delete(key);
    });
  localSignOuts.set(key, request);
  return request;
}

/**
 * Supabase getSession reads local storage and does not itself guarantee that
 * the server still recognizes the session. Verify it before mounting the
 * authenticated application shell.
 */
export async function getValidatedPersistedSession<TSession extends PersistedSession>(auth: SessionAuthClient<TSession>) {
  const stored = await auth.getSession();
  if (!stored.data.session) {
    if (isInvalidAuthSessionError(stored.error)) await clearInvalidLocalSession(auth);
    return null;
  }

  const validation = await auth.getUser(stored.data.session.access_token);
  if (!validation.error && validation.data.user) return stored.data.session;
  if (!isInvalidAuthSessionError(validation.error)) return stored.data.session;

  await clearInvalidLocalSession(auth);
  return null;
}

export async function clearSessionForApiFailure(auth: SessionAuthClient, status: number, code?: string | null) {
  if (shouldClearSessionForApiFailure(status, code)) await clearInvalidLocalSession(auth);
}

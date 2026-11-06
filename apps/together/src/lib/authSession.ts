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
export const PERSISTED_SESSION_VALIDATION_TIMEOUT_MS = 1_000;

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

  async function validationResult(session: TSession) {
    let validation: Awaited<ReturnType<typeof auth.getUser>> | null = null;
    try {
      validation = await Promise.race([
        auth.getUser(session.access_token),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), PERSISTED_SESSION_VALIDATION_TIMEOUT_MS)),
      ]);
    } catch {
      return 'uncertain' as const;
    }
    if (!validation || (!validation.error && validation.data.user)) return 'valid' as const;
    return isInvalidAuthSessionError(validation.error) ? 'invalid' as const : 'uncertain' as const;
  }

  // A persisted token is still bounded by its JWT expiry and every protected
  // API validates it server-side. Do not strand the entire app if the optional
  // startup verification request hangs; protected APIs will still reject an
  // invalid token, and a later authentication check can clear it locally.
  if (await validationResult(stored.data.session) !== 'invalid') return stored.data.session;

  // A token refresh can finish while the previous token's verification is in
  // flight. Do not clear that newly refreshed session because the old JWT was
  // rejected. Verify the current token once before deciding to sign out.
  let latest: Awaited<ReturnType<typeof auth.getSession>>;
  try {
    latest = await auth.getSession();
  } catch {
    return stored.data.session;
  }
  if (!latest.data.session) return null;
  if (latest.data.session.access_token !== stored.data.session.access_token) {
    if (await validationResult(latest.data.session) !== 'invalid') return latest.data.session;
  }

  await clearInvalidLocalSession(auth);
  return null;
}

export async function clearSessionForApiFailure(auth: SessionAuthClient, status: number, code?: string | null) {
  if (!shouldClearSessionForApiFailure(status, code)) return;

  // A request can leave with an old JWT just before Supabase refreshes it.
  // Its delayed 401 must not sign out the newly refreshed, valid session.
  // Check the current stored token with Auth before clearing local storage.
  try {
    await getValidatedPersistedSession(auth);
  } catch {
    // Storage or network failures are not proof that the session was revoked.
    // Keep it until the next successful verification or explicit sign-out.
  }
}

/** Hold auth changes until the persisted session has been checked. */
export function createAuthStartupGate<T>() {
  let ready = false;
  let pendingSession: T | null | undefined;

  return {
    onChange(event: string, session: T | null): { ready: false } | { ready: true; session: T | null } {
      // INITIAL_SESSION is the unvalidated copy from storage.
      if (event === 'INITIAL_SESSION') return { ready: false };
      if (!ready) {
        pendingSession = session;
        return { ready: false };
      }
      return { ready: true, session };
    },
    complete(validatedSession: T | null): T | null {
      ready = true;
      return pendingSession === undefined ? validatedSession : pendingSession;
    },
  };
}

import { useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { ensureWebAdultSession } from '../lib/webAdultSession';

/**
 * Establishes the private, server-issued website session used to protect
 * restricted projections and asset downloads. It is not a content preference;
 * the user's per-chat setting controls whether a conversation is explicit.
 */
export function WebAdultSessionBridge() {
  const { session } = useAuth();

  useEffect(() => {
    if (!session?.access_token) return;
    // Prepare the verified website cookie in parallel with bootstrap. Chat used
    // to wait for the entire world snapshot before this request even started.
    void ensureWebAdultSession(session.access_token).catch(() => undefined);
  }, [session?.access_token]);

  return null;
}

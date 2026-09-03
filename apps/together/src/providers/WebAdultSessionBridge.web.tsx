import { useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { ensureWebAdultSession } from '../lib/webAdultSession';
import { useTogether } from '../store/useTogether';

/**
 * Establishes the private, server-issued website session used to protect
 * restricted projections and asset downloads. It is not a content preference;
 * the user's per-chat setting controls whether a conversation is explicit.
 */
export function WebAdultSessionBridge() {
  const { session } = useAuth();
  const snapshotReady = useTogether((state) => Boolean(state.snapshot));

  useEffect(() => {
    if (!session?.access_token || !snapshotReady) return;
    const prepare = () => {
      void ensureWebAdultSession(session.access_token).catch(() => undefined);
    };
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(prepare, { timeout: 750 });
      return () => window.cancelIdleCallback(idleId);
    }
    const timer = setTimeout(prepare, 150);
    return () => clearTimeout(timer);
  }, [session?.access_token, snapshotReady]);

  return null;
}

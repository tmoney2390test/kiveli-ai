import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

/** Native lists measure their first page before exposing its final scroll position. */
export function useTimelineReveal(key: string, ready: boolean) {
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const quiet = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hidden = Platform.OS !== 'web' && ready && revealedKey !== key;
  const settled = useCallback(() => {
    if (!hidden) return;
    if (quiet.current) clearTimeout(quiet.current);
    quiet.current = setTimeout(() => setRevealedKey(key), 240);
  }, [hidden, key]);
  useEffect(() => {
    if (!hidden) return;
    // A missing layout event must never leave a conversation invisible.
    const deadline = setTimeout(() => setRevealedKey(key), 1_000);
    settled();
    return () => { clearTimeout(deadline); if (quiet.current) clearTimeout(quiet.current); };
  }, [hidden, key, settled]);
  return { hidden, settled };
}

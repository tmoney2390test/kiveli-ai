import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const SIGNED_URL_LIFETIME_SECONDS = 60 * 60;
const REFRESH_INTERVAL_MS = 50 * 60 * 1000;

export function useProfileAvatarUrl(path?: string | null) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    if (!path) {
      setUrl(null);
      return undefined;
    }

    const load = async () => {
      const { data, error } = await supabase.storage
        .from('together-user-media')
        .createSignedUrl(path, SIGNED_URL_LIFETIME_SECONDS);
      if (cancelled) return;
      setUrl(error ? null : data?.signedUrl ?? null);
      refreshTimer = setTimeout(() => void load(), REFRESH_INTERVAL_MS);
    };

    void load();
    return () => {
      cancelled = true;
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [path]);

  return url;
}

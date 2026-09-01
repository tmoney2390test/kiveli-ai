import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const SIGNED_URL_LIFETIME_SECONDS = 60 * 60;
const REFRESH_INTERVAL_MS = 50 * 60 * 1000;

export function useProfileAvatarUrl(path?: string | null) {
  const [signed, setSigned] = useState<{ path: string; url: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    if (!path) {
      setSigned(null);
      return undefined;
    }

    // Never keep another Persona's previous signed image visible while a new
    // private path is being resolved.
    setSigned(null);

    const load = async () => {
      const { data, error } = await supabase.storage
        .from('together-user-media')
        .createSignedUrl(path, SIGNED_URL_LIFETIME_SECONDS);
      if (cancelled) return;
      setSigned(error || !data?.signedUrl ? null : { path, url: data.signedUrl });
      refreshTimer = setTimeout(() => void load(), REFRESH_INTERVAL_MS);
    };

    void load();
    return () => {
      cancelled = true;
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [path]);

  // This synchronous path check prevents even a one-frame flash of the
  // previously selected Persona before the effect above runs.
  return signed && signed.path === path ? signed.url : null;
}

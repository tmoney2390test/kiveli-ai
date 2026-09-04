import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const SIGNED_URL_LIFETIME_SECONDS = 60 * 60;
const REFRESH_INTERVAL_MS = 50 * 60 * 1000;

type CachedAvatarUrl = { url: string; refreshAt: number };

// Signed avatar URLs used to live only inside each hook instance. Opening
// Settings therefore repeated the signing request even when the persistent
// desktop rail had already resolved the exact same private image. Keep the
// short-lived URL in memory so every surface in this app session can reuse it.
const cachedAvatarUrls = new Map<string, CachedAvatarUrl>();
const pendingAvatarUrls = new Map<string, Promise<CachedAvatarUrl | null>>();

function cachedAvatarUrl(path: string, now = Date.now()): CachedAvatarUrl | null {
  const cached = cachedAvatarUrls.get(path);
  if (!cached || cached.refreshAt <= now) {
    if (cached) cachedAvatarUrls.delete(path);
    return null;
  }
  return cached;
}

async function requestAvatarUrl(path: string, force = false): Promise<CachedAvatarUrl | null> {
  if (!force) {
    const cached = cachedAvatarUrl(path);
    if (cached) return cached;
    const pending = pendingAvatarUrls.get(path);
    if (pending) return pending;
  }

  const request = (async () => {
    const { data, error } = await supabase.storage
      .from('together-user-media')
      .createSignedUrl(path, SIGNED_URL_LIFETIME_SECONDS);
    if (error || !data?.signedUrl) return null;
    const cached = { url: data.signedUrl, refreshAt: Date.now() + REFRESH_INTERVAL_MS };
    cachedAvatarUrls.set(path, cached);
    return cached;
  })();
  pendingAvatarUrls.set(path, request);
  try {
    return await request;
  } finally {
    if (pendingAvatarUrls.get(path) === request) pendingAvatarUrls.delete(path);
  }
}

export async function prefetchProfileAvatarUrl(path?: string | null): Promise<string | null> {
  if (!path) return null;
  return (await requestAvatarUrl(path))?.url ?? null;
}

export function useProfileAvatarUrl(path?: string | null) {
  const [signed, setSigned] = useState<{ path: string; url: string } | null>(() => {
    if (!path) return null;
    const cached = cachedAvatarUrl(path);
    return cached ? { path, url: cached.url } : null;
  });

  useEffect(() => {
    let cancelled = false;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    if (!path) {
      setSigned(null);
      return undefined;
    }

    // Reuse a URL already resolved by the app shell without one blank render.
    // Never keep another Persona's image visible while a new path is signing.
    const cached = cachedAvatarUrl(path);
    setSigned(cached ? { path, url: cached.url } : null);

    const load = async (force = false) => {
      const next = await requestAvatarUrl(path, force);
      if (cancelled) return;
      setSigned(next ? { path, url: next.url } : null);
      if (next) refreshTimer = setTimeout(() => void load(true), Math.max(1000, next.refreshAt - Date.now()));
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

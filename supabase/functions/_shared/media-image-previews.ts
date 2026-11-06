import type { SupabaseClient } from '@supabase/supabase-js';
import { isSafelyVisible } from '../../../packages/together-domain/src/content-projection.ts';

// One bounded preview size keeps galleries sharp without downloading originals.
// Originals remain the source for the viewer, downloads, and generation inputs.
export const IMAGE_PREVIEW_TRANSFORM = {
  width: 768,
  height: 768,
  resize: 'contain' as const,
  quality: 72,
};
const URL_LIFETIME_SECONDS = 900;
const CACHE_LIFETIME_MS = 10 * 60_000;
const MAX_CACHE_ENTRIES = 512;
type Row = Record<string, any>;

export function createImagePreviewSigner() {
  const cache = new Map<string, { url: string; expiresAt: number }>();
  const pending = new Map<string, Promise<string | null>>();
  return async (
    db: SupabaseClient,
    rows: Row[],
    now = Date.now(),
    budgetMs = 900,
  ): Promise<Map<string, string>> => {
    const images = [
      ...new Map(rows.filter(eligiblePreview).map((row) => [String(row.storage_path), row]))
        .values(),
    ];
    const result = new Map<string, string>();
    if (!images.length) return result;
    let index = 0;
    let expired = false;
    const worker = async () => {
      while (!expired && index < images.length) {
        const row = images[index++]!;
        const path = String(row.storage_path);
        const revision = String(
          row.metadata?.providerJobId ?? row.metadata?.providerRequestId ?? row.created_at ?? '',
        );
        const key = `${path}:${revision}`;
        const cached = cache.get(key);
        if (cached && cached.expiresAt > now) {
          result.set(path, cached.url);
          continue;
        }
        let signing = pending.get(key);
        if (!signing) {
          signing = Promise.resolve().then(() =>
            db.storage.from('together-user-media').createSignedUrl(path, URL_LIFETIME_SECONDS, {
              transform: IMAGE_PREVIEW_TRANSFORM,
            })
          )
            .then(({ data, error }) => {
              if (error || !data?.signedUrl) return null;
              if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
              cache.set(key, { url: data.signedUrl, expiresAt: now + CACHE_LIFETIME_MS });
              return data.signedUrl;
            }).catch(() => null).finally(() => pending.delete(key));
          pending.set(key, signing);
        }
        const url = await signing;
        if (url) result.set(path, url);
      }
    };
    // Previews are optional: a slow storage service must not hold up chat/home.
    // Already-started requests can warm the cache; stop launching more at expiry.
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.all(Array.from({ length: Math.min(8, images.length) }, worker)),
        new Promise<void>((resolve) => {
          timer = setTimeout(() => {
            expired = true;
            resolve();
          }, budgetMs);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    return new Map(result);
  };
}

export const signImagePreviews = createImagePreviewSigner();

function eligiblePreview(row: Row): boolean {
  return (row.media_type === 'image' || row.kind === 'image') &&
    (row.status === 'ready' || row.upload_status === 'uploaded') &&
    isSafelyVisible(row) && typeof row.storage_path === 'string' && Boolean(row.storage_path);
}

/** Derive a preview only from an already authorized image capability. */
export function imagePreviewUrl(
  row: Row,
  originalUrl: string | null,
  previews: ReadonlyMap<string, string>,
): string | null {
  if (!originalUrl || (row.media_type !== 'image' && row.kind !== 'image')) return null;
  if (isSafelyVisible(row)) return previews.get(String(row.storage_path ?? '')) ?? null;
  try {
    const url = new URL(originalUrl);
    if (
      !url.pathname.endsWith('/functions/v1/together-adult-asset') || !url.searchParams.has('grant')
    ) return null;
    url.searchParams.set('variant', 'preview');
    return url.toString();
  } catch {
    return null;
  }
}

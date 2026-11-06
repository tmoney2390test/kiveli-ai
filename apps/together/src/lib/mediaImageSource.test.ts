import { describe, expect, it } from 'vitest';
import { generatedMediaCacheKey, generatedMediaImageSource, generatedMediaPreviewSource, privateStoredImageSource, privateStoredPreviewSource } from './mediaImageSource';

describe('generated media image cache', () => {
  it('keeps one cache identity when the same image receives a new signed URL', () => {
    const media = {
      id: 'photo-1',
      storage_path: 'user/photo.jpg',
      created_at: '2026-10-01T00:00:00Z',
      metadata: { providerJobId: 'job-1' },
      signed_url: 'https://example.com/photo?token=first',
    };
    expect(generatedMediaCacheKey(media)).toBe(generatedMediaCacheKey({ ...media, signed_url: 'https://example.com/photo?token=second' }));
    expect(generatedMediaCacheKey(media)).not.toBe(generatedMediaCacheKey({ ...media, metadata: { providerJobId: 'job-2' } }));
  });

  it('separates preview and original bytes while secure URLs rotate', () => {
    const media = { id: 'image', created_at: '2026-10-26', signed_url: 'https://test/original', preview_url: 'https://test/preview', metadata: {} };
    const original = generatedMediaImageSource(media)!;
    const preview = generatedMediaPreviewSource(media)!;
    expect(original.uri).toBe(media.signed_url);
    expect(preview.uri).toBe(media.preview_url);
    expect(preview.cacheKey).not.toBe(original.cacheKey);
    expect(generatedMediaPreviewSource({ ...media, preview_url: 'https://test/preview?rotated' })?.cacheKey).toBe(preview.cacheKey);
    expect(generatedMediaPreviewSource({ ...media, signed_url: null })).toBeUndefined();
    expect(generatedMediaPreviewSource({ ...media, preview_url: null })).toBeUndefined();
    expect(privateStoredImageSource('original', 'path')?.cacheKey).not.toBe(privateStoredPreviewSource('preview', 'path')?.cacheKey);
  });
});

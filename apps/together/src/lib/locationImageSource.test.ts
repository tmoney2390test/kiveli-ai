import { describe, expect, it, vi } from 'vitest';
vi.mock('../assets', () => ({ locationHeroAsset: vi.fn((world, slug, ancestors) => ({ uri: `catalog:${world}:${slug}`, ancestors })) }));
import { locationImageSource } from './locationImageSource';
import { locationHeroAsset } from '../assets';

describe('place artwork across chat and planning', () => {
  const place = { slug: 'personal-home', custom_image_url: 'https://private.test/home?token=first', custom_image_path: 'owner/places/home/photo.jpg' };
  it('uses the uploaded place image instead of generated scene media or world art', () => {
    expect(locationImageSource('eos-meridian', place, { sceneMediaUrl: 'https://media.test/old-scene.jpg' })).toEqual({ uri: place.custom_image_url, cacheKey: `kivelle-private:${place.custom_image_path}` });
  });
  it('keeps the cache identity across renewed signed URLs, and changes it for a replacement upload', () => {
    const renewed = locationImageSource('eos-meridian', { ...place, custom_image_url: 'https://private.test/home?token=new' });
    expect(renewed.cacheKey).toBe(locationImageSource('eos-meridian', place).cacheKey);
    expect(renewed.uri).toContain('token=new');
    expect(locationImageSource('eos-meridian', { ...place, custom_image_path: 'owner/places/home/replacement.jpg' }).cacheKey).not.toBe(renewed.cacheKey);
  });
  it('preserves generated scene art for ordinary places', () => {
    expect(locationImageSource('eos-meridian', { slug: 'rain-room' }, { sceneMediaUrl: 'https://media.test/scene.jpg' })).toEqual({ uri: 'https://media.test/scene.jpg' });
  });
  it('keeps the authored place, district, and world fallback when there is no upload', () => {
    locationImageSource('eos-meridian', { slug: 'personal-legacy-home' }, { ancestorSlugs: ['solace-biome'] });
    expect(locationHeroAsset).toHaveBeenLastCalledWith('eos-meridian', 'personal-legacy-home', ['solace-biome']);
    locationImageSource('eos-meridian');
    expect(locationHeroAsset).toHaveBeenLastCalledWith('eos-meridian', undefined, undefined);
  });
});

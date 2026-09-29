import type { ImageSource } from 'expo-image';
import type { Location } from '../types';
import { locationHeroAsset } from '../assets';
import { privateStoredImageSource } from './mediaImageSource';

type PlaceArtwork = Pick<Location, 'slug' | 'custom_image_url' | 'custom_image_path'>;

/** Uploaded place artwork is canonical, including when a scene has generated media. */
export function locationImageSource(
  worldSlug?: string | null,
  place?: PlaceArtwork | null,
  options: { ancestorSlugs?: readonly string[]; sceneMediaUrl?: string } = {},
): ImageSource {
  return privateStoredImageSource(place?.custom_image_url, place?.custom_image_path)
    ?? (options.sceneMediaUrl ? { uri: options.sceneMediaUrl } : locationHeroAsset(worldSlug, place?.slug, options.ancestorSlugs));
}

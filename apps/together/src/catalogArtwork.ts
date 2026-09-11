import type { ImageSource } from 'expo-image';
import manifest from './catalog-artwork.json';
import { KIVELLI_IMAGE_PLACEHOLDER } from './lib/imageWarmup';

// Public, built-in presentation artwork only. Never put uploads, generated
// media, private references or signed URLs in this immutable catalog.
export const CATALOG_ARTWORK_BASE = 'https://mfysnlghlhxxcwnwpxog.supabase.co/storage/v1/object/public/kivelli-catalog/';
export type CatalogArtworkPath = keyof typeof manifest;

export function catalogArtwork(path: CatalogArtworkPath, size: 'display' | 'thumbnail' = 'display'): ImageSource {
  const entry = manifest[path][size];
  return {uri: `${CATALOG_ARTWORK_BASE}${entry.file}`, width:entry.width, height:entry.height, cacheKey:`kivelli-catalog:${entry.file}`};
}

const thumbnailByDisplay = new Map(Object.values(manifest).map(entry => [
  `${CATALOG_ARTWORK_BASE}${entry.display.file}`,
  {uri:`${CATALOG_ARTWORK_BASE}${entry.thumbnail.file}`,width:entry.thumbnail.width,height:entry.thumbnail.height,cacheKey:`kivelli-catalog:${entry.thumbnail.file}`},
]));

/** Do not rewrite custom/private images, signed URLs or local fallback assets. */
export function catalogThumbnail(source: ImageSource | number | undefined): ImageSource | number | undefined {
  return source && typeof source === 'object' && source.uri ? thumbnailByDisplay.get(source.uri) ?? source : source;
}

export function catalogImagePresentation<T>(source:T,failedUri?:string) {
  const uri=source && typeof source==='object' && 'uri' in source && typeof source.uri==='string' ? source.uri : undefined;
  const isCatalog=Boolean(uri?.startsWith(CATALOG_ARTWORK_BASE));
  return {uri,isCatalog,source:isCatalog&&uri===failedUri?KIVELLI_IMAGE_PLACEHOLDER:source};
}

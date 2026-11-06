import type{ImageSource}from'expo-image';
import type{GeneratedMedia}from'../types';

export function generatedMediaImageSource(media:Pick<GeneratedMedia,'id'|'signed_url'|'storage_path'|'metadata'|'created_at'>):ImageSource|undefined{
  if(!media.signed_url)return undefined;
  return{uri:media.signed_url,cacheKey:generatedMediaCacheKey(media)};
}

export function generatedMediaPreviewSource(media:Pick<GeneratedMedia,'id'|'preview_url'|'signed_url'|'storage_path'|'metadata'|'created_at'>):ImageSource|undefined{
  if(!media.signed_url||!media.preview_url)return undefined;
  return{uri:media.preview_url,cacheKey:`${generatedMediaCacheKey(media)}:preview-v1`};
}

export function privateStoredPreviewSource(uri:string|undefined|null,storagePath:string|undefined|null):ImageSource|undefined{
  return uri?{uri,cacheKey:storagePath?`kivelle-private:${storagePath}:preview-v1`:undefined}:undefined;
}

export function generatedMediaCacheKey(media:Pick<GeneratedMedia,'id'|'signed_url'|'storage_path'|'metadata'|'created_at'>):string{
  const revision=String(media.metadata?.providerJobId??media.metadata?.providerRequestId??media.created_at);
  // Signed URLs rotate on snapshot refresh for the same stored image. The
  // object identity and provider revision are the stable cache identity.
  return`kivelle-media:${media.storage_path??media.id}:${revision}`;
}

export function privateStoredImageSource(uri:string|undefined|null,storagePath:string|undefined|null):ImageSource|undefined{
  return uri?{uri,cacheKey:storagePath?`kivelle-private:${storagePath}`:undefined}:undefined;
}

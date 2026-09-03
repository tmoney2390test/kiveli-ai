import type{ImageSource}from'expo-image';
import type{GeneratedMedia}from'../types';

export function generatedMediaImageSource(media:Pick<GeneratedMedia,'id'|'signed_url'|'storage_path'|'metadata'|'created_at'>):ImageSource|undefined{
  if(!media.signed_url)return undefined;
  return{uri:media.signed_url,cacheKey:generatedMediaCacheKey(media)};
}

export function generatedMediaCacheKey(media:Pick<GeneratedMedia,'id'|'signed_url'|'storage_path'|'metadata'|'created_at'>):string{
  const revision=String(media.metadata?.providerJobId??media.metadata?.providerRequestId??media.created_at);
  return`kivelle-media:${media.storage_path??media.id}:${revision}:${media.signed_url??''}`;
}

export function privateStoredImageSource(uri:string|undefined|null,storagePath:string|undefined|null):ImageSource|undefined{
  return uri?{uri,cacheKey:storagePath?`kivelle-private:${storagePath}`:undefined}:undefined;
}

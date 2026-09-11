import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { Image, type ImageProps } from 'expo-image';
import { catalogImagePresentation } from '../catalogArtwork';
import { KIVELLI_IMAGE_PLACEHOLDER } from '../lib/imageWarmup';

/** The existing Expo cache owns downloads/eviction; no catalog-wide prefetch. */
export function CatalogImage(props: ImageProps) {
  const [failedUri, setFailedUri] = useState<string>();
  const {source,uri,isCatalog}=catalogImagePresentation(props.source,failedUri);
  useEffect(() => {
    if(!failedUri)return;
    const retry=()=>setFailedUri(undefined);
    const subscription=AppState.addEventListener('change',state=>{if(state==='active')retry();});
    if(typeof window!=='undefined')window.addEventListener?.('online',retry);
    return ()=>{subscription.remove();if(typeof window!=='undefined')window.removeEventListener?.('online',retry);};
  },[failedUri]);
  // Private/custom media must keep its own error handling, expiry and cache policy.
  if (!isCatalog) return <Image {...props} />;
  return <Image
    {...props}
    source={source}
    placeholder={props.placeholder ?? KIVELLI_IMAGE_PLACEHOLDER}
    placeholderContentFit={props.placeholderContentFit ?? 'cover'}
    cachePolicy="memory-disk"
    onError={event => { setFailedUri(uri); props.onError?.(event); }}
  />;
}

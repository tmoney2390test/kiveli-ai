import { useEffect } from 'react';
import { Image } from 'expo-image';
import { browserAllowsMediaWarmup } from '../lib/mediaPrefetch';

/** Start one neighbor after the visible photo loads; never warm a whole gallery. */
export function useNextPhotoWarmup(loaded: boolean, uri?: string, cacheKey?: string) {
  useEffect(() => {
    if (!loaded || !uri || !browserAllowsMediaWarmup()) return;
    // Session-bound grants stay uncached and are checked again when opened.
    if (!/^https:\/\//i.test(uri) || uri.includes('/together-adult-asset')) return;
    let active = true;
    let release: (() => void) | undefined;
    const timer = setTimeout(() => {
      if (!browserAllowsMediaWarmup()) return;
      void Image.loadAsync({ uri, cacheKey }).then((image) => {
        if (!active) {
          image.release();
          return;
        }
        release = () => image.release();
      }).catch(() => undefined);
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
      release?.();
    };
  }, [loaded, uri, cacheKey]);
}

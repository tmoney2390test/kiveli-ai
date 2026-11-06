import { useState } from 'react';
import { Image, type ImageProps, type ImageSource } from 'expo-image';

/** A preview failure falls back once to the original, including expired links. */
export function MediaImage(
  { previewSource, onError, ...props }: ImageProps & { previewSource?: ImageSource },
) {
  const [failedPreview, setFailedPreview] = useState<string>();
  const previewUri = previewSource?.uri;
  const showingPreview = Boolean(previewUri && previewUri !== failedPreview);
  return (
    <Image
      cachePolicy='memory-disk'
      loading='lazy'
      {...props}
      source={showingPreview ? previewSource : props.source}
      onError={(event) => {
        if (showingPreview) {
          setFailedPreview(previewUri);
          return;
        }
        onError?.(event);
      }}
    />
  );
}

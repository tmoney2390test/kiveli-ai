import { createElement, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { prepareVideoThumbnail, videoThumbnailAttributes, videoThumbnailHasFrame } from '../lib/videoThumbnail';

type Props = {uri: string; posterUri?: string | null; contentFit?: 'cover' | 'contain'; onReady?: () => void};

export function VideoMomentThumbnail({uri, posterUri, contentFit = 'cover', onReady}: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const readyReported = useRef<string | null>(null);
  const [visibleUri, setVisibleUri] = useState<string | null>(null);
  const [readyUri, setReadyUri] = useState<string | null>(null);
  useEffect(() => {
    readyReported.current = null;
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') {setVisibleUri(uri); return;}
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {setVisibleUri(uri); observer.disconnect();}
    }, {rootMargin: '180px'});
    observer.observe(root);
    return () => observer.disconnect();
  }, [uri]);
  const markReady = (event: SyntheticEvent<HTMLVideoElement>) => {
    if (!videoThumbnailHasFrame(event.currentTarget)) return;
    setReadyUri(uri);
    if (readyReported.current !== uri) {readyReported.current = uri; onReady?.();}
  };
  return createElement('div', {ref: rootRef, style: rootStyle},
    createElement('video', {
      key: uri, ...videoThumbnailAttributes(visibleUri === uri ? uri : undefined, posterUri),
      onLoadedMetadata: (event: SyntheticEvent<HTMLVideoElement>) => {
        try {prepareVideoThumbnail(event.currentTarget);} catch {/* A poster remains usable if seeking is unavailable. */}
      },
      onLoadedData: markReady, onSeeked: markReady, onCanPlay: markReady,
      onError: () => setReadyUri(null),
      // Metadata alone cannot paint a video frame. Never hide a usable poster while waiting.
      style: {...videoStyle, objectFit: contentFit, opacity: readyUri === uri || posterUri ? 1 : 0},
    }),
  );
}

const rootStyle = {position: 'absolute' as const, inset: 0, overflow: 'hidden', pointerEvents: 'none' as const};
const videoStyle = {position: 'absolute' as const, inset: 0, width: '100%', height: '100%', display: 'block', objectPosition: 'center', backgroundColor: 'transparent'};

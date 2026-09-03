import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * expo-image does not consistently forward its alt prop to the underlying web
 * image. These visual layers are described by their surrounding controls and
 * captions, so keep the raw image nodes decorative for assistive technology.
 */
export function WebDocumentAccessibilityBridge() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    const normalizeImages = (root: ParentNode) => {
      root.querySelectorAll?.('img:not([alt])').forEach((image) => image.setAttribute('alt', ''));
    };

    normalizeImages(document);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches('img:not([alt])')) node.setAttribute('alt', '');
          normalizeImages(node);
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}

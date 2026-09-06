import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { isMobileChatComposerElement } from '../lib/mobileChatKeyboard';

const KEYBOARD_SETTLE_DELAYS_MS = [0, 48, 140, 280, 520, 820] as const;

/**
 * Mobile browsers resize and pan the visual viewport in multiple passes while
 * opening their soft keyboard. Keep the chat's existing bottom anchor alive
 * throughout that transition so the newest message remains above the composer.
 */
export function useMobileChatKeyboardPin(enabled: boolean, onPin: () => void) {
  const onPinRef = useRef(onPin);
  const timersRef = useRef(new Set<ReturnType<typeof setTimeout>>());
  onPinRef.current = onPin;

  const cancelScheduledPins = useCallback(() => {
    for (const timer of timersRef.current) clearTimeout(timer);
    timersRef.current.clear();
  }, []);

  const pinThroughKeyboardTransition = useCallback(() => {
    if (!enabled) return;
    cancelScheduledPins();
    for (const delay of KEYBOARD_SETTLE_DELAYS_MS) {
      const timer = setTimeout(() => {
        timersRef.current.delete(timer);
        onPinRef.current();
      }, delay);
      timersRef.current.add(timer);
    }
  }, [cancelScheduledPins, enabled]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled || typeof window === 'undefined') return;
    const visualViewport = window.visualViewport;
    const handleViewportChange = () => {
      if (typeof document !== 'undefined' && isMobileChatComposerElement(document.activeElement)) {
        pinThroughKeyboardTransition();
      }
    };
    visualViewport?.addEventListener('resize', handleViewportChange);
    visualViewport?.addEventListener('scroll', handleViewportChange);
    window.addEventListener('resize', handleViewportChange);
    return () => {
      visualViewport?.removeEventListener('resize', handleViewportChange);
      visualViewport?.removeEventListener('scroll', handleViewportChange);
      window.removeEventListener('resize', handleViewportChange);
    };
  }, [enabled, pinThroughKeyboardTransition]);

  useEffect(() => cancelScheduledPins, [cancelScheduledPins]);

  return pinThroughKeyboardTransition;
}

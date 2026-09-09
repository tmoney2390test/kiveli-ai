import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, type ViewStyle } from 'react-native';
import { isMobileChatComposerElement, mobileChatViewport, type MobileChatViewport } from '../lib/mobileChatKeyboard';

const KEYBOARD_SETTLE_DELAYS_MS = [0, 48, 140, 280, 520, 820] as const;

/**
 * Mobile browsers resize and pan the visual viewport in multiple passes while
 * opening their soft keyboard. Keep the chat's existing bottom anchor alive
 * throughout that transition so the newest message remains above the composer.
 */
export function useMobileChatKeyboardPin(enabled: boolean, onPin: () => void) {
  const [viewport, setViewport] = useState<MobileChatViewport | null>(null);
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
    let previous: MobileChatViewport | null = null;
    const handleViewportChange = () => {
      const next = mobileChatViewport({
        layoutHeight: window.innerHeight,
        visualHeight: visualViewport?.height,
        offsetTop: visualViewport?.offsetTop,
        scale: visualViewport?.scale,
      });
      if (!next || (previous?.height === next.height && previous.top === next.top)) return;
      previous = next;
      setViewport(next);
      if (typeof document !== 'undefined' && isMobileChatComposerElement(document.activeElement)) {
        pinThroughKeyboardTransition();
      }
    };
    handleViewportChange();
    visualViewport?.addEventListener('resize', handleViewportChange);
    visualViewport?.addEventListener('scroll', handleViewportChange);
    window.addEventListener('resize', handleViewportChange);
    return () => {
      visualViewport?.removeEventListener('resize', handleViewportChange);
      visualViewport?.removeEventListener('scroll', handleViewportChange);
      window.removeEventListener('resize', handleViewportChange);
      cancelScheduledPins();
    };
  }, [cancelScheduledPins, enabled, pinThroughKeyboardTransition]);

  useEffect(() => cancelScheduledPins, [cancelScheduledPins]);

  // Fix the entire conversation (header, messages, composer) to the visible area.
  // Native retains KeyboardAvoidingView; desktop retains the normal app shell.
  const viewportStyle = Platform.OS === 'web' && enabled && viewport ? {
    position: 'fixed', top: viewport.top, left: 0, right: 0,
    height: viewport.height, flex: 0,
  } as unknown as ViewStyle : undefined;

  return { onComposerFocus: pinThroughKeyboardTransition, viewportStyle };
}

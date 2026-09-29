import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { isMobileChatComposerElement } from '../lib/mobileChatKeyboard';

const KEYBOARD_SETTLE_DELAYS_MS = [0, 48, 140, 280, 520, 820] as const;

/**
 * Mobile browsers resize and pan the visual viewport in multiple passes while
 * opening their soft keyboard. Keep the chat's existing bottom anchor alive
 * and size the web app to the actually visible area so the composer and send
 * button remain above the keyboard. Safari does not consistently honor
 * interactive-widget=resizes-content.
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
    const root = document.getElementById('root');
    const previousHeight = root?.style.height;
    const previousTransform = root?.style.transform;
    let blurTimer: ReturnType<typeof setTimeout> | undefined;

    const restoreRoot = () => {
      if (!root) return;
      root.style.height = previousHeight ?? '';
      root.style.transform = previousTransform ?? '';
    };
    const fitVisibleViewport = () => {
      if (!root || !isMobileChatComposerElement(document.activeElement)) return;
      const height = visualViewport?.height ?? window.innerHeight;
      if (!Number.isFinite(height) || height < 200) return;
      // pageTop is more reliable than offsetTop during iOS keyboard panning.
      const top = visualViewport
        ? Math.max(0, visualViewport.pageTop - window.scrollY)
        : 0;
      root.style.height = `${Math.round(height)}px`;
      root.style.transform = top > 0 ? `translateY(${Math.round(top)}px)` : previousTransform ?? '';
    };
    const handleViewportChange = () => {
      if (isMobileChatComposerElement(document.activeElement)) {
        fitVisibleViewport();
        pinThroughKeyboardTransition();
      }
    };
    const handleFocusIn = () => {
      if (blurTimer) clearTimeout(blurTimer);
      fitVisibleViewport();
    };
    const handleFocusOut = () => {
      if (blurTimer) clearTimeout(blurTimer);
      blurTimer = setTimeout(() => {
        if (!isMobileChatComposerElement(document.activeElement)) restoreRoot();
      }, 0);
    };
    visualViewport?.addEventListener('resize', handleViewportChange);
    visualViewport?.addEventListener('scroll', handleViewportChange);
    window.addEventListener('resize', handleViewportChange);
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);
    return () => {
      if (blurTimer) clearTimeout(blurTimer);
      visualViewport?.removeEventListener('resize', handleViewportChange);
      visualViewport?.removeEventListener('scroll', handleViewportChange);
      window.removeEventListener('resize', handleViewportChange);
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
      restoreRoot();
    };
  }, [enabled, pinThroughKeyboardTransition]);

  useEffect(() => cancelScheduledPins, [cancelScheduledPins]);

  return pinThroughKeyboardTransition;
}

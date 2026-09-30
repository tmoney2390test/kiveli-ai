import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { chatRootFrameForVisibleViewport, isMobileChatComposerElement } from '../lib/mobileChatKeyboard';

const KEYBOARD_SETTLE_DELAYS_MS = [0, 48, 140, 280, 520, 820] as const;

/**
 * Mobile browsers resize and pan the visual viewport in multiple passes while
 * opening their soft keyboard. Keep the chat's existing bottom anchor alive
 * and size the web app to the visible area so the composer stays above both
 * Safari's bottom controls and the keyboard. Safari does not consistently
 * honor interactive-widget=resizes-content.
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
    let appliedTranslateY = 0;
    let blurTimer: ReturnType<typeof setTimeout> | undefined;
    const fitTimers = new Set<ReturnType<typeof setTimeout>>();

    const restoreRoot = () => {
      if (!root) return;
      root.style.height = previousHeight ?? '';
      root.style.transform = previousTransform ?? '';
      appliedTranslateY = 0;
    };
    const fitVisibleViewport = () => {
      if (!root) return;
      // Account for our own previous translation while measuring. Safari can
      // pan the visual viewport without moving the root; offsetTop identifies
      // the visible bottom edge, not a distance to push the chat downward.
      const frame = chatRootFrameForVisibleViewport({
        rootTop: root.getBoundingClientRect().top - appliedTranslateY,
        viewportTop: visualViewport?.offsetTop ?? 0,
        viewportHeight: visualViewport?.height ?? window.innerHeight,
      });
      if (!frame) return;
      root.style.height = `${Math.round(frame.height)}px`;
      root.style.transform = frame.translateY > 0 ? `translateY(${Math.round(frame.translateY)}px)` : previousTransform ?? '';
      appliedTranslateY = frame.translateY;
    };
    const settleViewportFit = () => {
      for (const timer of fitTimers) clearTimeout(timer);
      fitTimers.clear();
      for (const delay of KEYBOARD_SETTLE_DELAYS_MS) {
        const timer = setTimeout(() => { fitTimers.delete(timer); fitVisibleViewport(); }, delay);
        fitTimers.add(timer);
      }
    };
    const handleViewportChange = () => {
      settleViewportFit();
      if (isMobileChatComposerElement(document.activeElement)) {
        pinThroughKeyboardTransition();
      }
    };
    const handleFocusIn = () => {
      if (blurTimer) clearTimeout(blurTimer);
      settleViewportFit();
    };
    const handleFocusOut = () => {
      if (blurTimer) clearTimeout(blurTimer);
      blurTimer = setTimeout(() => {
        if (!isMobileChatComposerElement(document.activeElement)) settleViewportFit();
      }, 0);
    };
    fitVisibleViewport();
    settleViewportFit();
    visualViewport?.addEventListener('resize', handleViewportChange);
    visualViewport?.addEventListener('scroll', handleViewportChange);
    window.addEventListener('resize', handleViewportChange);
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);
    return () => {
      if (blurTimer) clearTimeout(blurTimer);
      for (const timer of fitTimers) clearTimeout(timer);
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

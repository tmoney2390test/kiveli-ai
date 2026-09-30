import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { chatRootFrameForVisibleViewport, isMobileChatComposerElement } from '../lib/mobileChatKeyboard';

const KEYBOARD_SETTLE_DELAYS_MS = [0, 120, 320, 650, 1000] as const;

/**
 * Safari pans and resizes the visible viewport while opening its keyboard.
 * Keep the chat root out of Safari's document scroll, size it to the visible
 * viewport. The composer is overlaid independently of the timeline, so
 * Safari's keyboard animation does not move it with the message list.
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
    const previousPosition = root?.style.position;
    const previousTop = root?.style.top;
    const previousLeft = root?.style.left;
    const previousRight = root?.style.right;
    const previousWidth = root?.style.width;
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    let blurTimer: ReturnType<typeof setTimeout> | undefined;
    let frame: number | null = null;
    const fitTimers = new Set<ReturnType<typeof setTimeout>>();

    // The chat timeline scrolls internally. Letting the page itself scroll is
    // what lets Safari pan the header away and strand the composer underneath
    // its keyboard toolbar.
    if (root) {
      root.style.position = 'fixed';
      root.style.top = '0';
      root.style.left = '0';
      root.style.right = '0';
      root.style.width = '100%';
    }
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    const restoreRoot = () => {
      if (!root) return;
      root.style.height = previousHeight ?? '';
      root.style.position = previousPosition ?? '';
      root.style.top = previousTop ?? '';
      root.style.left = previousLeft ?? '';
      root.style.right = previousRight ?? '';
      root.style.width = previousWidth ?? '';
    };
    const fitVisibleViewport = () => {
      if (!root) return;
      const viewportTop = visualViewport?.offsetTop ?? 0;
      const viewportHeight = visualViewport?.height ?? window.innerHeight;
      const rootFrame = chatRootFrameForVisibleViewport({
        rootTop: root.getBoundingClientRect().top,
        viewportTop,
        viewportHeight,
      });
      if (!rootFrame) return;
      const height = `${Math.round(rootFrame.height)}px`;
      if (root.style.height !== height) root.style.height = height;
    };
    const settleViewportFit = () => {
      for (const timer of fitTimers) clearTimeout(timer);
      fitTimers.clear();
      if (frame !== null) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = null;
        fitVisibleViewport();
        if (isMobileChatComposerElement(document.activeElement)) onPinRef.current();
      });
      for (const delay of [120, 360]) {
        const timer = setTimeout(() => {
          fitTimers.delete(timer);
          fitVisibleViewport();
          if (isMobileChatComposerElement(document.activeElement)) onPinRef.current();
        }, delay);
        fitTimers.add(timer);
      }
    };
    const handleViewportChange = () => {
      settleViewportFit();
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
    settleViewportFit();
    visualViewport?.addEventListener('resize', handleViewportChange);
    visualViewport?.addEventListener('scroll', handleViewportChange);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange);
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);
    return () => {
      if (blurTimer) clearTimeout(blurTimer);
      if (frame !== null) cancelAnimationFrame(frame);
      for (const timer of fitTimers) clearTimeout(timer);
      visualViewport?.removeEventListener('resize', handleViewportChange);
      visualViewport?.removeEventListener('scroll', handleViewportChange);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange);
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
      restoreRoot();
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [enabled]);

  useEffect(() => cancelScheduledPins, [cancelScheduledPins]);

  return pinThroughKeyboardTransition;
}

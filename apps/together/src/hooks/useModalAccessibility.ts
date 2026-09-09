import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReduced(value); }).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { active = false; subscription.remove(); };
  }, []);
  return reduced;
}

export function useModalAccessibility(visible: boolean, id: string, onClose: () => void) {
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const root = () => document.getElementById(id);
    const focusable = () => Array.from(root()?.querySelectorAll<HTMLElement>('button,[href],input,textarea,select,[tabindex]:not([tabindex="-1"])') ?? []).filter(el => !el.hasAttribute('disabled') && el.getClientRects().length > 0);
    const timer = setTimeout(() => (focusable()[0] ?? root())?.focus(), 0);
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); }
      if (event.key !== 'Tab') return;
      const items = focusable(), first = items[0], last = items.at(-1);
      if (!first) { event.preventDefault(); root()?.focus(); return; }
      const active = document.activeElement;
      if (!root()?.contains(active) || (!event.shiftKey && active === last)) { event.preventDefault(); first.focus(); }
      else if (event.shiftKey && active === first) { event.preventDefault(); last?.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { clearTimeout(timer); document.removeEventListener('keydown', keydown); document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus(); };
  }, [visible, id]);
}

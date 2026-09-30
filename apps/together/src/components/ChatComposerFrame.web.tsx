import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { FrostedSurface } from './FrostedGlass';

export function ChatComposerFrame({ floating, bottomInset, onLayout, style, children }: {
  floating: boolean;
  bottomInset: number;
  onLayout?: (event: LayoutChangeEvent) => void;
  style: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!floating) return;
    const node = document.createElement('div');
    node.id = 'kivelli-chat-composer-portal';
    node.style.position = 'fixed';
    node.style.zIndex = '120';
    node.style.pointerEvents = 'auto';
    document.body.appendChild(node);
    setHost(node);

    const viewport = window.visualViewport;
    let scheduledFrame = 0;
    let trackingFrame = 0;
    let trackingUntil = 0;
    const place = () => {
      // This node is outside Expo Router's animated/clipped chat tree. Safari
      // can pan that tree when the keyboard opens without moving the composer.
      const visibleBottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight);
      // A panned visual viewport can extend below the layout viewport. Keep
      // this signed; clamping it to zero strands the card above or below view.
      const layoutBottom = window.innerHeight - visibleBottom;
      node.style.left = `${Math.round(viewport?.offsetLeft ?? 0)}px`;
      node.style.width = `${Math.round(viewport?.width ?? window.innerWidth)}px`;
      node.style.bottom = `${Math.round(layoutBottom)}px`;

      // iOS Safari may pan fixed elements while opening the keyboard. Measure
      // the resulting position and correct it against the visible viewport.
      const actualBottom = node.getBoundingClientRect().bottom;
      if (Math.abs(actualBottom - visibleBottom) > 2) {
        node.style.bottom = `${Math.round(layoutBottom + actualBottom - visibleBottom)}px`;
      }
    };
    const schedulePlace = () => {
      if (scheduledFrame) cancelAnimationFrame(scheduledFrame);
      scheduledFrame = requestAnimationFrame(() => { scheduledFrame = 0; place(); });
    };
    const trackTransition = () => {
      trackingUntil = performance.now() + 1600;
      if (trackingFrame) return;
      const tick = () => {
        place();
        trackingFrame = performance.now() < trackingUntil ? requestAnimationFrame(tick) : 0;
      };
      trackingFrame = requestAnimationFrame(tick);
    };
    const onFocus = () => { if (node.contains(document.activeElement)) trackTransition(); };
    const onBlur = () => { trackTransition(); };
    schedulePlace();
    viewport?.addEventListener('resize', schedulePlace);
    viewport?.addEventListener('scroll', schedulePlace);
    window.addEventListener('resize', schedulePlace);
    window.addEventListener('scroll', schedulePlace);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', onBlur);
    return () => {
      viewport?.removeEventListener('resize', schedulePlace);
      viewport?.removeEventListener('scroll', schedulePlace);
      window.removeEventListener('resize', schedulePlace);
      window.removeEventListener('scroll', schedulePlace);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', onBlur);
      if (scheduledFrame) cancelAnimationFrame(scheduledFrame);
      if (trackingFrame) cancelAnimationFrame(trackingFrame);
      node.remove();
      setHost(null);
    };
  }, [floating]);

  if (!floating) return <View onLayout={onLayout} style={[style, { paddingBottom: Math.max(8, bottomInset) }]}>{children}</View>;

  const card = <View nativeID="chat-composer-frame" onLayout={onLayout} style={[styles.slot, { paddingBottom: Math.max(10, bottomInset) }]}>
    <FrostedSurface intensity={78} style={styles.glass}>{children}</FrostedSurface>
  </View>;
  return host ? createPortal(card, host) : <View style={styles.fallback}>{card}</View>;
}

const styles = StyleSheet.create({
  fallback: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 30 },
  slot: { paddingHorizontal: 12, paddingTop: 8, backgroundColor: 'transparent' },
  glass: {
    borderRadius: 28,
    borderCurve: 'continuous',
    borderColor: 'rgba(255,244,255,.20)',
    backgroundColor: 'rgba(27,22,36,.68)',
    shadowColor: '#000',
    shadowOpacity: .36,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    backdropFilter: 'blur(30px) saturate(145%)',
  } as ViewStyle,
});

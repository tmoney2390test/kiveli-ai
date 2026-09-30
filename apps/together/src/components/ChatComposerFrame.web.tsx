import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useGlobalSearchParams, usePathname } from 'expo-router';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { FrostedSurface } from './FrostedGlass';
import { chatComposerTopForVisibleViewport } from '../lib/mobileChatKeyboard';
import { isChatComposerRouteActive, type ChatComposerOwner } from '../lib/chatComposerRoute';

export function ChatComposerFrame({ owner, floating, bottomInset, onLayout, style, children }: {
  owner: ChatComposerOwner;
  floating: boolean;
  bottomInset: number;
  onLayout?: (event: LayoutChangeEvent) => void;
  style: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ group?: string }>();
  const routeActive = isChatComposerRouteActive(owner, pathname, params.group);
  const [host, setHost] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!floating || !routeActive) return;
    const node = document.createElement('div');
    node.id = 'kivelli-chat-composer-portal';
    // Fixed inputs are anchored to Safari's layout viewport, which can extend
    // below the keyboard. Place this layer in document coordinates instead.
    node.style.position = 'absolute';
    node.style.zIndex = '120';
    node.style.pointerEvents = 'auto';
    node.style.top = '0';
    node.style.visibility = 'hidden';
    document.body.appendChild(node);
    setHost(node);

    const viewport = window.visualViewport;
    const observer = new ResizeObserver(() => schedulePlace());
    observer.observe(node);
    let scheduledFrame = 0;
    let trackingFrame = 0;
    let trackingUntil = 0;
    const place = () => {
      // Safari can pan the visual viewport without updating scrollY or even
      // offsetTop. pageTop is the viewport's document position; innerHeight
      // describes the layout viewport and can include the keyboard.
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const viewportPageTop = viewport?.pageTop ?? window.scrollY;
      const composerHeight = node.getBoundingClientRect().height;
      if (composerHeight < 1) return;
      node.style.left = `${Math.round(viewport?.pageLeft ?? window.scrollX)}px`;
      node.style.width = `${Math.round(viewport?.width ?? window.innerWidth)}px`;
      const top = chatComposerTopForVisibleViewport({ pageTop: viewportPageTop, viewportHeight, composerHeight });
      node.style.top = `${Math.round(top)}px`;

      // Both getBoundingClientRect and this target are screen coordinates.
      // The previous code compared the rect with offsetTop + height (layout
      // coordinates), which could push the composer off-screen after a pan.
      const actualBottomOnScreen = node.getBoundingClientRect().bottom;
      if (Math.abs(actualBottomOnScreen - viewportHeight) > 2) {
        node.style.top = `${Math.round(chatComposerTopForVisibleViewport({ pageTop: viewportPageTop, viewportHeight, composerHeight, actualBottomOnScreen }))}px`;
      }
      node.style.visibility = 'visible';
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
    const hideOutsideChat = () => {
      if (isChatComposerRouteActive(owner, window.location.pathname, new URLSearchParams(window.location.search).get('group'))) return;
      node.style.display = 'none';
      if (node.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    };
    schedulePlace();
    window.addEventListener('popstate', hideOutsideChat);
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
      window.removeEventListener('popstate', hideOutsideChat);
      if (scheduledFrame) cancelAnimationFrame(scheduledFrame);
      if (trackingFrame) cancelAnimationFrame(trackingFrame);
      observer.disconnect();
      node.remove();
      setHost(null);
    };
  }, [floating, owner, routeActive]);

  if (!floating) return <View onLayout={onLayout} style={[style, { paddingBottom: Math.max(8, bottomInset) }]}>{children}</View>;
  if (!routeActive) return null;

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

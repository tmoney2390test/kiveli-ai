import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import {
  DESKTOP_SIDEBAR_COLLAPSED_WIDTH,
  isDesktopShellViewport,
} from '../lib/desktopNavigation';
import { colors } from '../theme';
import { AppShellContext, mobileAppShellState } from './AppShellContext';

const DesktopSidebar = lazy(() => import('./DesktopSidebar').then((module) => ({ default: module.DesktopSidebar })));

// Expo Router can remount the authenticated shell while swapping route trees.
// Keep pointer intent outside the component so a click inside the expanded rail
// cannot make the replacement shell flash back to its collapsed default.
let desktopSidebarHoverIntent = false;

export function ResponsiveAppShell({ children, enabled }: PropsWithChildren<{ enabled: boolean }>) {
  const { width } = useWindowDimensions();
  const desktop = enabled && isDesktopShellViewport(Platform.OS,width);
  const [sidebarHovered, setSidebarHovered] = useState(() => desktopSidebarHoverIntent);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSidebarHoverChange = useCallback((hovered: boolean) => {
    if (collapseTimer.current) {
      clearTimeout(collapseTimer.current);
      collapseTimer.current = null;
    }

    if (hovered) {
      desktopSidebarHoverIntent = true;
      setSidebarHovered(true);
      return;
    }

    collapseTimer.current = setTimeout(() => {
      collapseTimer.current = null;
      // Route transitions can briefly emit pointer-leave even though the cursor
      // is still physically over the persistent rail. Trust the rendered rail's
      // actual hover state before collapsing it.
      if (desktopSidebarStillHovered()) {
        desktopSidebarHoverIntent = true;
        setSidebarHovered(true);
        return;
      }
      desktopSidebarHoverIntent = false;
      setSidebarHovered(false);
    }, 140);
  }, []);

  useEffect(() => {
    if (!desktop) {
      desktopSidebarHoverIntent = false;
      setSidebarHovered(false);
    }
  }, [desktop]);

  useEffect(() => () => {
    if (collapseTimer.current) clearTimeout(collapseTimer.current);
  }, []);

  const expanded = desktop && sidebarHovered;
  const sidebarWidth = desktop ? DESKTOP_SIDEBAR_COLLAPSED_WIDTH : 0;
  const value = useMemo(() => desktop ? { desktop, expanded, sidebarWidth } : mobileAppShellState, [desktop, expanded, sidebarWidth]);

  return <AppShellContext.Provider value={value}>
    <View style={[styles.shell, desktop && styles.desktopShell]}>
      {desktop ? <View style={styles.sidebarSlot}><Suspense fallback={null}><DesktopSidebar expanded={expanded} onHoverChange={handleSidebarHoverChange} /></Suspense></View> : null}
      <View style={[styles.content, desktop && styles.desktopContent]}>{children}</View>
    </View>
  </AppShellContext.Provider>;
}

function desktopSidebarStillHovered() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return false;
  return document.getElementById('kivelle-desktop-sidebar')?.matches(':hover') === true;
}

const styles = StyleSheet.create({
  shell: { flex: 1, minWidth: 0, backgroundColor: colors.background },
  desktopShell: { flexDirection: 'row', minHeight: '100%', ...(Platform.OS === 'web' ? ({ minHeight: '100vh' } as never) : {}) },
  sidebarSlot: { zIndex: 300, width: DESKTOP_SIDEBAR_COLLAPSED_WIDTH, flexShrink: 0, overflow: 'visible' },
  content: { flex: 1, minWidth: 0 },
  desktopContent: { ...(Platform.OS === 'web' ? ({ minHeight: '100vh' } as never) : {}) },
});

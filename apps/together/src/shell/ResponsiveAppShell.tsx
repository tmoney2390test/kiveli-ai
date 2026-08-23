import { useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { usePathname } from 'expo-router';
import {
  defaultDesktopSidebarExpanded,
  DESKTOP_SHELL_BREAKPOINT,
  DESKTOP_SIDEBAR_COLLAPSED_WIDTH,
  DESKTOP_SIDEBAR_EXPANDED_WIDTH,
  isImmersiveDesktopPath,
} from '../lib/desktopNavigation';
import { colors } from '../theme';
import { AppShellContext, mobileAppShellState } from './AppShellContext';
import { DesktopSidebar } from './DesktopSidebar';

const preferenceKey = 'kivelle.desktop-sidebar.expanded';

export function ResponsiveAppShell({ children, enabled }: PropsWithChildren<{ enabled: boolean }>) {
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const desktop = enabled && Platform.OS === 'web' && width >= DESKTOP_SHELL_BREAKPOINT;
  const [preference, setPreference] = useState<boolean | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(preferenceKey);
    setPreference(saved === null ? null : saved === 'true');
  }, []);

  const expanded = desktop && (preference ?? (
    !isImmersiveDesktopPath(pathname) && defaultDesktopSidebarExpanded(width)
  ));
  const sidebarWidth = !desktop ? 0 : expanded ? DESKTOP_SIDEBAR_EXPANDED_WIDTH : DESKTOP_SIDEBAR_COLLAPSED_WIDTH;
  const value = useMemo(() => desktop ? { desktop, expanded, sidebarWidth } : mobileAppShellState, [desktop, expanded, sidebarWidth]);
  const toggle = () => {
    const next = !expanded;
    setPreference(next);
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.localStorage.setItem(preferenceKey, String(next));
  };

  return <AppShellContext.Provider value={value}>
    <View style={[styles.shell, desktop && styles.desktopShell]}>
      {desktop ? <DesktopSidebar expanded={expanded} onToggle={toggle} /> : null}
      <View style={[styles.content, desktop && styles.desktopContent]}>{children}</View>
    </View>
  </AppShellContext.Provider>;
}

const styles = StyleSheet.create({
  shell: { flex: 1, minWidth: 0, backgroundColor: colors.background },
  desktopShell: { flexDirection: 'row', minHeight: '100%', ...(Platform.OS === 'web' ? ({ minHeight: '100vh' } as never) : {}) },
  content: { flex: 1, minWidth: 0 },
  desktopContent: { ...(Platform.OS === 'web' ? ({ minHeight: '100vh' } as never) : {}) },
});

import { lazy, Suspense, useEffect, useRef, type PropsWithChildren } from 'react';
import { router, usePathname, useUnstableGlobalHref } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';
import { LoadingSkeleton } from '../components/RouteState';
import { useAuth } from '../hooks/useAuth';
import { isPublicAppPath, signInPathFor } from '../lib/sessionRouting';
import { consumeWebEntryHref, entryPathname, initialWebEntryHref } from '../lib/webEntryRoute';
import { clearSessionSnapshot } from '../lib/sessionSnapshotCache';

const AuthenticatedSessionGate = lazy(() => import('./AuthenticatedSessionGate').then((module) => ({ default: module.AuthenticatedSessionGate })));

const demoMode = __DEV__ && process.env.EXPO_PUBLIC_TOGETHER_DEMO_MODE === 'true';

export function KivelleSessionGate({ children }: PropsWithChildren) {
  const routerPathname = usePathname();
  const pathname = Platform.OS === 'web' && typeof window !== 'undefined'
    ? window.location.pathname
    : routerPathname;
  const href = useUnstableGlobalHref();
  const { session, loading: authLoading } = useAuth();
  const redirectTarget = useRef<string | null>(null);
  const previousUserId=useRef<string|null>(null);
  const publicPath = isPublicAppPath(pathname);
  const entryHref = Platform.OS === 'web' ? initialWebEntryHref() : null;
  const entryPath = entryHref ? entryPathname(entryHref) : null;

  useEffect(() => {
    if (Platform.OS !== 'web' || authLoading) return;
    if (!entryHref || entryPath === '/') {
      consumeWebEntryHref();
      return;
    }
    // Keep the captured deep link alive through Expo's short hydration window.
    // The router can report the correct route first and only then fall back to
    // its authenticated index, so consuming it immediately would miss the race.
    if (pathname === entryPath) {
      const timer = setTimeout(consumeWebEntryHref, 5000);
      return () => clearTimeout(timer);
    }
  }, [authLoading, entryHref, entryPath, pathname]);

  useEffect(() => {
    if (demoMode) return;
    if (authLoading) return;
    if (!session) {
      if(Platform.OS==='web'&&previousUserId.current)clearSessionSnapshot(previousUserId.current);
      previousUserId.current=null;
      // Avoid loading the authenticated world store into signed-out public pages.
      void import('../store/useTogether').then(({ useTogether }) => {
        if (useTogether.getState().snapshot) useTogether.getState().clear();
      });
      if (!publicPath) {
        const target = signInPathFor(href);
        if (redirectTarget.current !== target) {
          redirectTarget.current = target;
          router.replace(target as never);
        }
      }
      return;
    }
    previousUserId.current=session.user.id;
    redirectTarget.current = null;
  }, [authLoading, session?.user.id, publicPath, href]);

  if (demoMode || session) {
    return <Suspense fallback={<LoadingSkeleton label="Opening your world…" />}>
      <AuthenticatedSessionGate>{children}</AuthenticatedSessionGate>
    </Suspense>;
  }

  let blocker = null;
  if (authLoading && !publicPath) blocker = <LoadingSkeleton label="Restoring your session…" />;
  else if (!session && !publicPath) blocker = <LoadingSkeleton label="Opening sign in…" />;

  return <>
    {children}
    {blocker ? <View style={styles.blocker}>{blocker}</View> : null}
  </>;
}

const styles = StyleSheet.create({
  blocker: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 1000, backgroundColor: '#080B13' },
});

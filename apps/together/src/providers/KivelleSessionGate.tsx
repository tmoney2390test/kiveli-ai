import { lazy, Suspense, useEffect, useRef, type PropsWithChildren } from 'react';
import { router, usePathname, useUnstableGlobalHref } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';
import { LoadingSkeleton } from '../components/RouteState';
import { RouteLoadingState } from '../components/RouteLoadingState';
import { useAuth } from '../hooks/useAuth';
import { useWebHydrated } from '../hooks/useWebHydrated';
import { isPublicAppPath, shouldHoldPrivateWebRouteForHydration, shouldKeepAuthTransitionMounted, signInPathFor } from '../lib/sessionRouting';
import { consumeWebEntryHref, effectiveWebEntryHref, entryPathname, initialWebEntryHref, shouldRecoverWebEntry } from '../lib/webEntryRoute';
import { clearSessionSnapshot } from '../lib/sessionSnapshotCache';

const AuthenticatedSessionGate = lazy(() => import('./AuthenticatedSessionGate').then((module) => ({ default: module.AuthenticatedSessionGate })));

const demoMode = __DEV__ && process.env.EXPO_PUBLIC_TOGETHER_DEMO_MODE === 'true';

export function KivelleSessionGate({ children }: PropsWithChildren) {
  const routerPathname = usePathname();
  const pathname = Platform.OS === 'web' && typeof window !== 'undefined'
    ? window.location.pathname
    : routerPathname;
  const href = useUnstableGlobalHref();
  const { session, loading: authLoading, signingOut } = useAuth();
  const webHydrated = useWebHydrated();
  const redirectTarget = useRef<string | null>(null);
  const previousUserId=useRef<string|null>(null);
  const publicPath = isPublicAppPath(pathname);
  const entryHrefRef=useRef<string|null>(Platform.OS==='web'?initialWebEntryHref():null);
  const entryHref = effectiveWebEntryHref(entryHrefRef.current);
  const entryPath = entryHref ? entryPathname(entryHref) : null;

  useEffect(() => {
    if (Platform.OS !== 'web' || authLoading) return;
    if (!entryHref || entryPath === '/') {
      consumeWebEntryHref();
      return;
    }
    if(session&&shouldRecoverWebEntry({entryHref,browserPathname:pathname})){
      // The root route can unmount before its own recovery effect observes
      // Expo's transient /home redirect. This layout-level gate survives that
      // transition and restores the captured destination.
      router.replace(entryHref as never);
    }
    // AuthenticatedSessionGate consumes the entry only after the browser and
    // router have both settled on it with an authenticated snapshot.
  }, [authLoading, entryHref, entryPath, pathname,session]);

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

  if (shouldHoldPrivateWebRouteForHydration({ platform: Platform.OS, hydrated: webHydrated, pathname })) {
    return <View style={styles.hydration}><LoadingSkeleton label="Opening Kivelle…" /></View>;
  }

  if (session && shouldKeepAuthTransitionMounted(pathname)) {
    // Auth and callback screens present their own success/loading state and
    // navigate only after the destination is ready. Preserve their component
    // identity so controlled credentials and feedback do not reset mid-flow.
    return <>{children}</>;
  }

  if (demoMode || session) {
    return <Suspense fallback={<RouteLoadingState pathname={pathname} />}>
      <AuthenticatedSessionGate>{children}</AuthenticatedSessionGate>
    </Suspense>;
  }

  let blocker = null;
  if (authLoading && !publicPath) blocker = <RouteLoadingState pathname={pathname} label="Restoring your session…" />;
  else if (!session && !publicPath) blocker = <LoadingSkeleton label={signingOut ? 'Signing you out…' : 'Taking you to sign in…'} />;

  return <>
    {children}
    {blocker ? <View style={styles.blocker}>{blocker}</View> : null}
  </>;
}

const styles = StyleSheet.create({
  blocker: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 1000, backgroundColor: '#080B13' },
  hydration: { flex: 1, minHeight: 420, backgroundColor: '#080B13' },
});

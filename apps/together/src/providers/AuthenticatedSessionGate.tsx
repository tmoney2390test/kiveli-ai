import { useEffect, useRef, type PropsWithChildren } from 'react';
import { router, usePathname } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';
import { ErrorState } from '../components/RouteState';
import { RouteLoadingState } from '../components/RouteLoadingState';
import { resolveKivelleAccountStage } from '../lib/authRouting';
import { desktopShellAllowed } from '../lib/desktopNavigation';
import { isAgeConfirmationPath, isCompanionOnboardingPath, isPublicAppPath } from '../lib/sessionRouting';
import { ResponsiveAppShell } from '../shell/ResponsiveAppShell';
import { useTogether } from '../store/useTogether';
import { useAuth } from '../hooks/useAuth';
import { readSessionSnapshot, writeSessionSnapshot } from '../lib/sessionSnapshotCache';
import { consumeWebEntryHref, initialWebEntryHref, shouldConsumeWebEntry } from '../lib/webEntryRoute';

const demoMode = __DEV__ && process.env.EXPO_PUBLIC_TOGETHER_DEMO_MODE === 'true';

export function AuthenticatedSessionGate({ children }: PropsWithChildren) {
  const routerPathname = usePathname();
  // During static web hydration Expo can briefly report the root or an older
  // stack screen while the address bar already points at a deep link. The
  // browser path is authoritative and prevents a refreshed /stories page from
  // being mistaken for onboarding or the app root and replaced with /home.
  const pathname = Platform.OS === 'web' && typeof window !== 'undefined'
    ? window.location.pathname
    : routerPathname;
  const { session }=useAuth();
  const { snapshot, loading, error, refresh, setSnapshot } = useTogether();
  const redirectTarget = useRef<string | null>(null);
  const hydrationUserId=useRef<string|null>(null);
  const publicPath = isPublicAppPath(pathname);
  const agePath = isAgeConfirmationPath(pathname);
  const companionOnboardingPath = isCompanionOnboardingPath(pathname);

  useEffect(() => {
    if (pathname === '/' || pathname === '/home') router.prefetch('/home' as never);
  }, [pathname]);

  useEffect(() => {
    const userId=demoMode?'demo':session?.user.id;
    if(!userId||snapshot||loading||error||hydrationUserId.current===userId)return;
    hydrationUserId.current=userId;
    const cached=!demoMode&&Platform.OS==='web'?readSessionSnapshot(userId):null;
    if(cached)setSnapshot(cached);
    void refresh({force:Boolean(cached)});
  }, [error,loading,refresh,session?.user.id,setSnapshot,snapshot]);

  useEffect(()=>{
    const userId=session?.user.id;
    if(demoMode||Platform.OS!=='web'||!userId||!snapshot)return;
    const timer=setTimeout(()=>writeSessionSnapshot(userId,snapshot),500);
    return()=>clearTimeout(timer);
  },[session?.user.id,snapshot]);

  useEffect(()=>{
    if(Platform.OS!=='web'||!snapshot)return;
    const entryHref=initialWebEntryHref();
    if(shouldConsumeWebEntry({entryHref,browserPathname:pathname,snapshotReady:Boolean(snapshot)}))consumeWebEntryHref();
  },[pathname,snapshot]);

  useEffect(() => {
    if (!snapshot || publicPath) return;
    const stage = resolveKivelleAccountStage(snapshot.profile);
    const target = stage === 'age_confirmation'
      ? (agePath ? null : '/age-confirmation')
      : stage === 'onboarding'
        ? (companionOnboardingPath ? null : '/choose-companion')
        : (agePath || companionOnboardingPath ? '/home' : null);
    if (!target) {
      redirectTarget.current = null;
      return;
    }
    if (redirectTarget.current !== target) {
      redirectTarget.current = target;
      router.replace(target as never);
    }
  }, [agePath, companionOnboardingPath, publicPath, snapshot]);

  let blocker = null;
  if (!snapshot && !publicPath) {
    blocker = error
      ? <ErrorState message={error} onRetry={() => void refresh()} />
      : <RouteLoadingState pathname={pathname} label="Opening your world…" />;
  } else if (snapshot && !publicPath) {
    const stage = resolveKivelleAccountStage(snapshot.profile);
    if ((stage === 'age_confirmation' && !agePath) || (stage === 'onboarding' && !companionOnboardingPath) || (stage === 'ready' && (agePath || companionOnboardingPath))) {
      blocker = <RouteLoadingState pathname={pathname} label={stage === 'age_confirmation' ? 'Opening age confirmation…' : stage === 'onboarding' ? 'Preparing your first meeting…' : 'Opening your world…'} />;
    }
  }

  const shellEnabled = Boolean(snapshot && resolveKivelleAccountStage(snapshot.profile) === 'ready' && desktopShellAllowed(pathname));
  return <>
    <ResponsiveAppShell enabled={shellEnabled}>{children}</ResponsiveAppShell>
    {blocker ? <View style={styles.blocker}>{blocker}</View> : null}
  </>;
}

const styles = StyleSheet.create({
  blocker: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 1000, backgroundColor: '#080B13' },
});

import { useEffect, useRef, type PropsWithChildren } from 'react';
import { router, usePathname } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';
import { ErrorState, LoadingSkeleton } from '../components/RouteState';
import { resolveKivelleAccountStage } from '../lib/authRouting';
import { desktopShellAllowed } from '../lib/desktopNavigation';
import { isAgeConfirmationPath, isCompanionOnboardingPath, isPublicAppPath } from '../lib/sessionRouting';
import { ResponsiveAppShell } from '../shell/ResponsiveAppShell';
import { useTogether } from '../store/useTogether';

export function AuthenticatedSessionGate({ children }: PropsWithChildren) {
  const routerPathname = usePathname();
  // During static web hydration Expo can briefly report the root or an older
  // stack screen while the address bar already points at a deep link. The
  // browser path is authoritative and prevents a refreshed /stories page from
  // being mistaken for onboarding or the app root and replaced with /home.
  const pathname = Platform.OS === 'web' && typeof window !== 'undefined'
    ? window.location.pathname
    : routerPathname;
  const { snapshot, loading, error, refresh } = useTogether();
  const redirectTarget = useRef<string | null>(null);
  const publicPath = isPublicAppPath(pathname);
  const agePath = isAgeConfirmationPath(pathname);
  const companionOnboardingPath = isCompanionOnboardingPath(pathname);

  useEffect(() => {
    if (!snapshot && !loading && !error) void refresh();
  }, [snapshot, loading, error, refresh]);

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
      : <LoadingSkeleton label="Opening your world…" />;
  } else if (snapshot && !publicPath) {
    const stage = resolveKivelleAccountStage(snapshot.profile);
    if ((stage === 'age_confirmation' && !agePath) || (stage === 'onboarding' && !companionOnboardingPath) || (stage === 'ready' && (agePath || companionOnboardingPath))) {
      blocker = <LoadingSkeleton label={stage === 'age_confirmation' ? 'Opening age confirmation…' : stage === 'onboarding' ? 'Preparing your first meeting…' : 'Opening your world…'} />;
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

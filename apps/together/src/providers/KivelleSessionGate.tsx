import { useEffect, useRef, type PropsWithChildren } from 'react';
import { router, usePathname, useUnstableGlobalHref } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { ErrorState, LoadingSkeleton } from '../components';
import { useAuth } from '../hooks/useAuth';
import { isAgeConfirmationPath, isCompanionOnboardingPath, isPublicAppPath, signInPathFor } from '../lib/sessionRouting';
import { resolveKivelleAccountStage } from '../lib/authRouting';
import { useTogether } from '../store/useTogether';
import { desktopShellAllowed } from '../lib/desktopNavigation';
import { ResponsiveAppShell } from '../shell/ResponsiveAppShell';

const demoMode = __DEV__ && process.env.EXPO_PUBLIC_TOGETHER_DEMO_MODE === 'true';

export function KivelleSessionGate({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const href = useUnstableGlobalHref();
  const { session, loading: authLoading } = useAuth();
  const { snapshot, loading, error, refresh, clear } = useTogether();
  const redirectTarget = useRef<string | null>(null);
  const publicPath = isPublicAppPath(pathname);
  const agePath = isAgeConfirmationPath(pathname);
  const companionOnboardingPath = isCompanionOnboardingPath(pathname);

  useEffect(() => {
    if (demoMode) return;
    if (authLoading) return;
    if (!session) {
      if (snapshot) clear();
      if (!publicPath) {
        const target = signInPathFor(href);
        if (redirectTarget.current !== target) {
          redirectTarget.current = target;
          router.replace(target as never);
        }
      }
      return;
    }

    redirectTarget.current = null;
    if (!snapshot && !loading && !error) void refresh();
  }, [authLoading, session?.user.id, snapshot, loading, error, publicPath, href, refresh, clear]);

  useEffect(() => {
    if (demoMode || authLoading || !session || !snapshot || publicPath) return;
    const stage = resolveKivelleAccountStage(snapshot.profile);
    const target = stage === 'age_confirmation'
      ? (agePath ? null : '/age-confirmation')
      : stage === 'onboarding'
        ? (companionOnboardingPath ? null : '/choose-companion')
        : (agePath || companionOnboardingPath ? '/home' : null);
    if (!target) return;
    if (redirectTarget.current !== target) {
      redirectTarget.current = target;
      router.replace(target as never);
    }
  }, [agePath, authLoading, companionOnboardingPath, publicPath, session?.user.id, snapshot]);

  if (demoMode) return children;

  let blocker = null;
  if (authLoading) blocker = <LoadingSkeleton label="Restoring your session…" />;
  else if (!session && !publicPath) blocker = <LoadingSkeleton label="Opening sign in…" />;
  if (session && !snapshot && !publicPath) {
    blocker = error
      ? <ErrorState message={error} onRetry={() => void refresh()} />
      : <LoadingSkeleton label="Opening your world…" />;
  }
  if (session && snapshot && !publicPath) {
    const stage = resolveKivelleAccountStage(snapshot.profile);
    if ((stage === 'age_confirmation' && !agePath) || (stage === 'onboarding' && !companionOnboardingPath) || (stage === 'ready' && (agePath || companionOnboardingPath))) {
      blocker = <LoadingSkeleton label={stage === 'age_confirmation' ? 'Opening age confirmation…' : stage === 'onboarding' ? 'Preparing your first meeting…' : 'Opening your world…'} />;
    }
  }

  const shellEnabled = Boolean(session && snapshot && resolveKivelleAccountStage(snapshot.profile) === 'ready' && desktopShellAllowed(pathname));
  return <>
    <ResponsiveAppShell enabled={shellEnabled}>{children}</ResponsiveAppShell>
    {blocker ? <View style={styles.blocker}>{blocker}</View> : null}
  </>;
}

const styles = StyleSheet.create({
  blocker: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 1000, backgroundColor: '#080B13' },
});

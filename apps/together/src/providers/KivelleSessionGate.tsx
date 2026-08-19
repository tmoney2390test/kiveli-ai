import { useEffect, useRef, type PropsWithChildren } from 'react';
import { router, usePathname } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { ErrorState, LoadingSkeleton } from '../components';
import { useAuth } from '../hooks/useAuth';
import { isLifeSetupPath, isPublicAppPath, signInPathFor } from '../lib/sessionRouting';
import { useTogether } from '../store/useTogether';

const demoMode = __DEV__ && process.env.EXPO_PUBLIC_TOGETHER_DEMO_MODE === 'true';

export function KivelleSessionGate({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const { session, loading: authLoading } = useAuth();
  const { snapshot, loading, error, refresh, clear } = useTogether();
  const redirectTarget = useRef<string | null>(null);
  const publicPath = isPublicAppPath(pathname);
  const setupPath = isLifeSetupPath(pathname);

  useEffect(() => {
    if (demoMode) return;
    if (authLoading) return;
    if (!session) {
      if (snapshot) clear();
      if (!publicPath) {
        const target = signInPathFor(pathname);
        if (redirectTarget.current !== target) {
          redirectTarget.current = target;
          router.replace(target);
        }
      }
      return;
    }

    redirectTarget.current = null;
    if (!snapshot && !loading && !error) void refresh();
  }, [authLoading, session?.user.id, snapshot, loading, error, publicPath, pathname, refresh, clear]);

  useEffect(() => {
    if (demoMode) return;
    if (authLoading || !session || !snapshot || snapshot.profile || publicPath || setupPath) return;
    const target = '/choose-companion';
    if (redirectTarget.current !== target) {
      redirectTarget.current = target;
      router.replace(target);
    }
  }, [authLoading, session?.user.id, snapshot, publicPath, setupPath]);

  if (demoMode) return children;

  let blocker = null;
  if (authLoading) blocker = <LoadingSkeleton label="Restoring your session…" />;
  else if (!session && !publicPath) blocker = <LoadingSkeleton label="Opening sign in…" />;
  if (session && !snapshot && !publicPath) {
    blocker = error
      ? <ErrorState message={error} onRetry={() => void refresh()} />
      : <LoadingSkeleton label="Opening your world…" />;
  }
  if (session && snapshot && !snapshot.profile && !publicPath && !setupPath) {
    blocker = <LoadingSkeleton label="Preparing your first meeting…" />;
  }

  return <>{children}{blocker ? <View style={styles.blocker}>{blocker}</View> : null}</>;
}

const styles = StyleSheet.create({
  blocker: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 1000, backgroundColor: '#080B13' },
});

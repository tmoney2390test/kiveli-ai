import { useEffect } from 'react';
import { router, usePathname } from 'expo-router';
import { Platform } from 'react-native';
import { ErrorState, LoadingSkeleton } from './RouteState';
import { resolveKivelleAccountStage } from '../lib/authRouting';
import { useTogether } from '../store/useTogether';
import { shouldRunAuthenticatedIndexRedirect } from '../lib/rootRoute';
import { initialWebEntryHref, shouldRecoverWebEntry } from '../lib/webEntryRoute';

export default function AuthenticatedIndex() {
  const pathname = usePathname();
  const { snapshot, loading, error, refresh } = useTogether();
  const browserPath = Platform.OS === 'web' && typeof window !== 'undefined'
    ? window.location.pathname
    : null;
  const entryHref = Platform.OS === 'web' ? initialWebEntryHref() : null;
  const recoverDeepLink = shouldRecoverWebEntry({ entryHref, browserPathname: browserPath });
  const isActiveRoot = shouldRunAuthenticatedIndexRedirect({
    platform: Platform.OS,
    routerPathname: pathname,
    browserPathname: browserPath,
  });
  const stage = snapshot ? resolveKivelleAccountStage(snapshot.profile) : null;

  useEffect(() => {
    if (recoverDeepLink && entryHref) {
      // Let Expo Router resolve the captured route. Manually dispatching a
      // popstate event here raced the authenticated index and could strand a
      // refreshed Settings deep link on Home.
      router.replace(entryHref as never);
      return;
    }
    if (!isActiveRoot || loading || error || !stage) return;
    // A navigation may have started after this effect was scheduled. Re-check
    // the live address immediately before replacing the route so an old index
    // render can never pull /stories (or another sibling screen) back home.
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location.pathname !== '/') return;
    const target = stage === 'age_confirmation'
      ? '/age-confirmation'
      : stage === 'onboarding'
        ? '/choose-companion'
        : '/home';
    router.replace(target as never);
  }, [entryHref, error, isActiveRoot, loading, recoverDeepLink, stage]);

  // Expo Router can retain the root screen beneath a deep-linked stack route.
  // Its Redirect must never replace an active route such as /stories or
  // /settings just because the inactive index screen remains mounted.
  if (recoverDeepLink) return <LoadingSkeleton label="Opening your page…" />;
  if (!isActiveRoot) return null;

  if (loading || (!snapshot && !error)) return <LoadingSkeleton label="Opening your world…" />;
  if (error) return <ErrorState message={error} onRetry={() => void refresh()} />;
  return <LoadingSkeleton label={stage === 'age_confirmation' ? 'Opening age confirmation…' : stage === 'onboarding' ? 'Preparing your first meeting…' : 'Opening your world…'} />;
}

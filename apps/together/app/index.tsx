import { lazy, Suspense } from 'react';
import Head from 'expo-router/head';
import { StartupLoadingState } from '../src/components/StartupLoadingState';
import { useAuth } from '../src/hooks/useAuth';
import { rootEntryPresentation } from '../src/lib/rootRoute';
import { PublicLandingPage } from '../src/components/landing/PublicLandingPage';
import { publicLandingPrimaryHeroUri } from '../src/components/landing/publicLandingAssets';
import { publicLandingWebCss } from '../src/components/landing/publicLandingWebCss';
import { useTogether } from '../src/store/useTogether';

const AuthenticatedIndex = lazy(() => import('../src/components/AuthenticatedIndex'));

export default function Index() {
  const { session, loading } = useAuth();
  const snapshotReady = useTogether((state) => Boolean(state.snapshot));
  const presentation = rootEntryPresentation({ authLoading: loading, hasSession: Boolean(session) });
  const startupFallback = snapshotReady ? null : <StartupLoadingState />;

  return <>
    <Head>
      <link rel="preload" as="image" href={publicLandingPrimaryHeroUri} fetchPriority="high" />
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      <style>{publicLandingWebCss}</style>
    </Head>
    {presentation === 'loading'
      ? startupFallback
      : presentation === 'public'
        ? <PublicLandingPage />
        : <Suspense fallback={startupFallback}><AuthenticatedIndex /></Suspense>}
  </>;
}

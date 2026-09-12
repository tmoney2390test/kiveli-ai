import { lazy, Suspense } from 'react';
import Head from 'expo-router/head';
import { RouteLoadingState } from '../src/components/RouteLoadingState';
import { useAuth } from '../src/hooks/useAuth';
import { rootEntryPresentation } from '../src/lib/rootRoute';
import { PublicLandingPage } from '../src/components/landing/PublicLandingPage';
import { publicLandingPrimaryHeroUri } from '../src/components/landing/publicLandingAssets';
import { publicLandingWebCss } from '../src/components/landing/publicLandingWebCss';

const AuthenticatedIndex = lazy(() => import('../src/components/AuthenticatedIndex'));

export default function Index() {
  const { session, loading } = useAuth();
  const presentation = rootEntryPresentation({ authLoading: loading, hasSession: Boolean(session) });

  return <>
    <Head>
      <link rel="preload" as="image" href={publicLandingPrimaryHeroUri} fetchPriority="high" />
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      <style>{publicLandingWebCss}</style>
    </Head>
    {presentation === 'loading'
      ? <RouteLoadingState pathname="/home" label="Restoring your session…" />
      : presentation === 'public'
        ? <PublicLandingPage />
        : <Suspense fallback={<RouteLoadingState pathname="/home" label="Opening your world…" />}><AuthenticatedIndex /></Suspense>}
  </>;
}

import { lazy, Suspense } from 'react';
import Head from 'expo-router/head';
import { RouteLoadingState } from '../src/components/RouteLoadingState';
import { useAuth } from '../src/hooks/useAuth';
import { rootEntryPresentation } from '../src/lib/rootRoute';

const AuthenticatedIndex = lazy(() => import('../src/components/AuthenticatedIndex'));
const PublicLandingPage = lazy(() => import('../src/components/landing/PublicLandingPage').then((module) => ({ default: module.PublicLandingPage })));

export default function Index() {
  const { session, loading } = useAuth();
  const presentation = rootEntryPresentation({ authLoading: loading, hasSession: Boolean(session) });

  return <>
    <Head>
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    </Head>
    {presentation === 'loading'
      ? <RouteLoadingState pathname="/home" label="Restoring your session…" />
      : presentation === 'public'
        ? <Suspense fallback={<RouteLoadingState pathname="/" label="Opening Kivelle…" />}><PublicLandingPage /></Suspense>
        : <Suspense fallback={<RouteLoadingState pathname="/home" label="Opening your world…" />}><AuthenticatedIndex /></Suspense>}
  </>;
}

import { lazy, Suspense } from 'react';
import Head from 'expo-router/head';
import { LoadingSkeleton } from '../src/components/RouteState';
import { PublicLandingPage } from '../src/components/landing/PublicLandingPage';
import { useAuth } from '../src/hooks/useAuth';

const AuthenticatedIndex = lazy(() => import('../src/components/AuthenticatedIndex'));

export default function Index() {
  const { session } = useAuth();

  return <>
    <Head>
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    </Head>
    {!session
      ? <PublicLandingPage />
      : <Suspense fallback={<LoadingSkeleton label="Opening your world…" />}><AuthenticatedIndex /></Suspense>}
  </>;
}

import { lazy, Suspense } from 'react';
import Head from 'expo-router/head';
import { LoadingSkeleton } from '../src/components/RouteState';
import { PublicLandingPage } from '../src/components/landing/PublicLandingPage';
import { useAuth } from '../src/hooks/useAuth';

const AuthenticatedIndex = lazy(() => import('../src/components/AuthenticatedIndex'));
const LANDING_HERO = '/landing/juniper-city.53ab020b54a527943e9b4b3bb308190d.webp';

export default function Index() {
  const { session, loading: authLoading } = useAuth();

  return <>
    <Head><link rel="preload" href={LANDING_HERO} as="image" fetchPriority="high" /></Head>
    {authLoading
      ? <LoadingSkeleton label="Opening Kivelle…" />
      : !session
        ? <PublicLandingPage />
        : <Suspense fallback={<LoadingSkeleton label="Opening your world…" />}><AuthenticatedIndex /></Suspense>}
  </>;
}

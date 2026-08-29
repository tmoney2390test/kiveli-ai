import { lazy, Suspense } from 'react';
import Head from 'expo-router/head';
import { LoadingSkeleton } from '../src/components/RouteState';
import { PublicLandingPage } from '../src/components/landing/PublicLandingPage';
import { useAuth } from '../src/hooks/useAuth';

const AuthenticatedIndex = lazy(() => import('../src/components/AuthenticatedIndex'));
const LANDING_HERO = '/landing/juniper-city.87558d22e240d5a06f101484d48933e8.jpg';

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

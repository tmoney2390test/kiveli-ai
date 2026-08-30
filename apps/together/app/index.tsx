import { lazy, Suspense } from 'react';
import Head from 'expo-router/head';
import { LoadingSkeleton } from '../src/components/RouteState';
import { PublicLandingPage } from '../src/components/landing/PublicLandingPage';
import { useAuth } from '../src/hooks/useAuth';

const AuthenticatedIndex = lazy(() => import('../src/components/AuthenticatedIndex'));
const LANDING_HERO = '/landing/juniper-city.53ab020b54a527943e9b4b3bb308190d.webp';
const LANDING_HERO_MOBILE = '/landing/juniper-city-mobile.1c4108fcc02f6799630e5fe041c335d4.webp';
const LANDING_HERO_PORTRAIT = '/landing/becka-shaw.412281e73f70efdbc1fa2998f7f9dd91.webp';

export default function Index() {
  const { session, loading: authLoading } = useAuth();

  return <>
    <Head>
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      <link rel="preload" href={LANDING_HERO_MOBILE} as="image" media="(max-width: 679px)" fetchPriority="high" />
      <link rel="preload" href={LANDING_HERO} as="image" media="(min-width: 680px)" fetchPriority="high" />
      <link rel="preload" href={LANDING_HERO_PORTRAIT} as="image" fetchPriority="high" />
    </Head>
    {authLoading
      ? <LoadingSkeleton label="Opening Kivelle…" />
      : !session
        ? <PublicLandingPage />
        : <Suspense fallback={<LoadingSkeleton label="Opening your world…" />}><AuthenticatedIndex /></Suspense>}
  </>;
}

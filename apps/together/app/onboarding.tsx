// The Auth screen defaults to account creation when no explicit sign-in mode
// is present. Rendering it directly avoids competing auth-gate redirects for
// this legacy public URL.
import { lazy, Suspense } from 'react';
import { LoadingSkeleton } from '../src/components/RouteState';

const Auth = lazy(() => import('./auth'));

export default function Onboarding() {
  return <Suspense fallback={<LoadingSkeleton label="Opening sign in…" />}><Auth /></Suspense>;
}

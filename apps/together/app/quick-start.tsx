/** Backward-compatible route for older links and partially-created accounts. */
import { lazy, Suspense } from 'react';
import { LoadingSkeleton } from '../src/components/RouteState';

const ChooseCompanion = lazy(() => import('./choose-companion'));

export default function QuickStart() {
  return <Suspense fallback={<LoadingSkeleton label="Finding your first companion…" />}><ChooseCompanion /></Suspense>;
}

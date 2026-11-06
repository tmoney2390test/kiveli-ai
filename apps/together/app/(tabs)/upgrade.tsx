// Keep the legacy tab URL functional without dispatching a navigation update
// while the tab navigator is mounting. Render-time redirects here could loop
// between the static entry route and the restored authenticated route on web.
import { lazy, Suspense } from 'react';
import { LoadingSkeleton } from '../../src/components/RouteState';

const Membership = lazy(() => import('../subscription'));

export default function Upgrade() {
  return <Suspense fallback={<LoadingSkeleton label="Opening your membership…" />}><Membership /></Suspense>;
}

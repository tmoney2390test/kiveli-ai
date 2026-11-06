// Legacy /profile links used to open the active companion. A user-profile route
// must always resolve to user-owned account settings instead.
// Render Settings in place so a restored static entry cannot race a redirect.
import { lazy, Suspense } from 'react';
import { LoadingSkeleton } from '../../src/components/RouteState';

const Settings = lazy(() => import('../settings'));

export default function Profile() {
  return <Suspense fallback={<LoadingSkeleton label="Opening your account…" />}><Settings /></Suspense>;
}

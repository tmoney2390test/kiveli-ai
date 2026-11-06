import { lazy, Suspense } from 'react';
import { LoadingSkeleton } from './ui';

const ScenarioBrowserContent = lazy(async () => ({
  default: (await import('./ScenarioBrowser')).ScenarioBrowser,
}));

type ScenarioBrowserProps = Parameters<typeof ScenarioBrowserContent>[0];

export function ScenarioBrowser(props: ScenarioBrowserProps) {
  return <Suspense fallback={<LoadingSkeleton label="Loading scenarios…" />}>
    <ScenarioBrowserContent {...props} />
  </Suspense>;
}

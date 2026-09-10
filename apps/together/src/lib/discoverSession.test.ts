import { expect, it } from 'vitest';
import { readDiscoverSession, saveDiscoverSession } from './discoverSession';
it('restores browsing filters, expanded results and position without mixing lives', () => {
  const saved = { ...readDiscoverSession('life-a'), spice: 2 as const, sortMode: 'age-desc' as const, visibleCount: 36, scrollY: 1740 };
  saveDiscoverSession('life-a', saved);
  saved.scrollY = 0;
  expect(readDiscoverSession('life-a')).toMatchObject({ spice: 2, sortMode: 'age-desc', visibleCount: 36, scrollY: 1740 });
  expect(readDiscoverSession('life-b')).toMatchObject({ spice: 'any', visibleCount: 12, scrollY: 0 });
});

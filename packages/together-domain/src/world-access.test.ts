import { describe, expect, it } from 'vitest';
import { hasOpenBuildWorldAccess, OPEN_PUBLISHED_WORLDS_DURING_BUILD } from './world-access';

describe('temporary open-world build policy', () => {
  it('opens every published world during development', () => {
    expect(OPEN_PUBLISHED_WORLDS_DURING_BUILD).toBe(true);
    expect(hasOpenBuildWorldAccess(true)).toBe(true);
  });

  it('does not expose unpublished worlds', () => {
    expect(hasOpenBuildWorldAccess(false)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { hasOpenBuildWorldAccess, isSubscriberEarlyAccessWorld, OPEN_PUBLISHED_WORLDS_DURING_BUILD } from './world-access';

describe('temporary open-world build policy', () => {
  it('opens ordinary published worlds during development', () => {
    expect(OPEN_PUBLISHED_WORLDS_DURING_BUILD).toBe(true);
    expect(hasOpenBuildWorldAccess(true)).toBe(true);
  });

  it('keeps subscriber early-access worlds behind membership', () => {
    const metadata = { subscriber_early_access: true };
    expect(isSubscriberEarlyAccessWorld(metadata)).toBe(true);
    expect(hasOpenBuildWorldAccess(true, metadata)).toBe(false);
  });

  it('does not expose unpublished worlds', () => {
    expect(hasOpenBuildWorldAccess(false)).toBe(false);
  });
});

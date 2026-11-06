import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserAllowsMediaWarmup, canWarmMedia } from './mediaPrefetch';

afterEach(() => vi.unstubAllGlobals());

describe('speculative media bandwidth', () => {
  it('avoids background downloads when offline, data saving, or on very slow connections', () => {
    expect(canWarmMedia({ online: false })).toBe(false);
    expect(canWarmMedia({ saveData: true, effectiveType: '4g' })).toBe(false);
    expect(canWarmMedia({ effectiveType: 'slow-2g' })).toBe(false);
    expect(canWarmMedia({ effectiveType: '2g' })).toBe(false);
    expect(canWarmMedia({ effectiveType: '4g' })).toBe(true);
    expect(canWarmMedia()).toBe(true);
  });

  it('reads browser NetworkInformation getters rather than assuming enumerable properties', () => {
    const connection = Object.create({ get saveData() { return true; }, get effectiveType() { return '4g'; } });
    vi.stubGlobal('navigator', { onLine: true, connection });
    expect(browserAllowsMediaWarmup()).toBe(false);
  });
});

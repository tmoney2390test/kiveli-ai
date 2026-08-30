import { describe, expect, it } from 'vitest';
import { routeLoadingKind } from '../lib/routeLoading';

describe('route loading states', () => {
  it('selects a skeleton shaped like the requested destination', () => {
    expect(routeLoadingKind('/home')).toBe('home');
    expect(routeLoadingKind('/explore?world=vesper')).toBe('explore');
    expect(routeLoadingKind('/media/123')).toBe('moments');
    expect(routeLoadingKind('/chat')).toBe('messages');
    expect(routeLoadingKind('/stories/play')).toBe('stories');
  });
});

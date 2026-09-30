import { describe, expect, it } from 'vitest';
import { isChatComposerRouteActive } from './chatComposerRoute';

describe('chat composer route visibility', () => {
  it('shows only the composer belonging to the active conversation', () => {
    expect(isChatComposerRouteActive('direct', '/chat', undefined)).toBe(true);
    expect(isChatComposerRouteActive('direct', '/chat', '1')).toBe(false);
    expect(isChatComposerRouteActive('group', '/chat', '1')).toBe(true);
    expect(isChatComposerRouteActive('group', '/group-chat', undefined)).toBe(true);
    expect(isChatComposerRouteActive('group', '/chat', undefined)).toBe(false);
  });

  it.each(['/home', '/explore', '/moments', '/chat-tab', '/subscription'])(
    'hides both composers on %s',
    (pathname) => {
      expect(isChatComposerRouteActive('direct', pathname, undefined)).toBe(false);
      expect(isChatComposerRouteActive('group', pathname, '1')).toBe(false);
    },
  );
});

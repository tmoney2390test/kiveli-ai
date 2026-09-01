import { describe, expect, it, vi } from 'vitest';
import { webBootstrap } from './webBootstrap';

describe('web bootstrap navigation guard', () => {
  it('lets Expo observe its alias, then restores the canonical entry before paint', () => {
    let current = new URL('https://kivelli.app/location/juniper-civic-arena?world=juniper-city');
    const transitions: string[] = [];
    const microtasks: Array<() => void> = [];
    const history = {
      state: {},
      pushState(_state: unknown, _title: string, href: string) {
        current = new URL(href, current);
        transitions.push(current.href);
      },
      replaceState(_state: unknown, _title: string, href: string) {
        current = new URL(href, current);
        transitions.push(current.href);
      },
    };
    const location = {
      get href() { return current.href; },
      get origin() { return current.origin; },
      get pathname() { return current.pathname; },
      get search() { return current.search; },
      get hash() { return current.hash; },
    };
    const globals: Record<string, unknown> = {};
    // This executes the application's own fixed bootstrap literal inside a
    // fully supplied test scope; it never evaluates external input.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const execute = new Function(
      'location', 'history', 'sessionStorage', 'document', 'setTimeout', 'queueMicrotask', 'globalThis', 'URL',
      webBootstrap,
    );
    execute(
      location,
      history,
      { getItem: () => null, removeItem: vi.fn() },
      { documentElement: { classList: { add: vi.fn(), remove: vi.fn() } } },
      vi.fn(),
      (callback: () => void) => microtasks.push(callback),
      globals,
      URL,
    );

    history.replaceState({}, '', '/?slug=juniper-civic-arena');
    expect(current.pathname).toBe('/');
    expect(microtasks).toHaveLength(1);

    microtasks.shift()?.();
    expect(current.href).toBe('https://kivelli.app/location/juniper-civic-arena?world=juniper-city');
    expect(transitions.map((href) => new URL(href).pathname)).toEqual(['/', '/location/juniper-civic-arena']);

    (globals.__KIVELLE_RELEASE_ENTRY_HISTORY_GUARD__ as (() => void))();
    history.replaceState({}, '', '/');
    expect(current.pathname).toBe('/');
  });
});

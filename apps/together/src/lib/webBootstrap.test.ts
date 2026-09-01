import { describe, expect, it, vi } from 'vitest';
import { webBootstrap } from './webBootstrap';

describe('web bootstrap route history guard', () => {
  it('preserves a deep-link URL while Expo hydrates through root aliases', () => {
    let current = new URL('https://kivelli.app/location/the-rivet?world=eos-meridian');
    const transitions: string[] = [];
    const history = {
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
    // The fixed application bootstrap runs in an isolated, fully supplied scope.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const execute = new Function(
      'location', 'history', 'sessionStorage', 'document', 'setTimeout', 'globalThis', 'URL',
      webBootstrap,
    );
    execute(
      location,
      history,
      { getItem: () => null, removeItem: vi.fn() },
      { documentElement: { classList: { add: vi.fn(), remove: vi.fn() } } },
      vi.fn(),
      globals,
      URL,
    );

    history.replaceState({}, '', '/?slug=the-rivet');
    history.replaceState({}, '', '/');
    expect(current.href).toBe('https://kivelli.app/location/the-rivet?world=eos-meridian');
    expect(transitions).toEqual([
      'https://kivelli.app/location/the-rivet?world=eos-meridian',
      'https://kivelli.app/location/the-rivet?world=eos-meridian',
    ]);

    (globals.__KIVELLE_RELEASE_ROUTE_HISTORY_GUARD__ as (() => void))();
    history.replaceState({}, '', '/');
    expect(current.pathname).toBe('/');
  });
});

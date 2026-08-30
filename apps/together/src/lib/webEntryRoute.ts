declare global {
  interface Window {
    __KIVELLE_ENTRY_HREF__?: string;
  }
}

let consumed = false;

export function initialWebEntryHref() {
  if (consumed || typeof window === 'undefined') return null;
  const href = window.__KIVELLE_ENTRY_HREF__;
  if (!href || !href.startsWith('/') || href.startsWith('//')) return null;
  return href;
}

export function consumeWebEntryHref() {
  consumed = true;
  if (typeof window !== 'undefined') delete window.__KIVELLE_ENTRY_HREF__;
}

export function entryPathname(href: string) {
  return href.split(/[?#]/, 1)[0]?.replace(/\/+$/, '') || '/';
}

export function shouldRecoverWebEntry(input: {
  entryHref?: string | null;
  browserPathname?: string | null;
}) {
  if (!input.entryHref) return false;
  const entryPath = entryPathname(input.entryHref);
  return entryPath !== '/' && entryPath !== input.browserPathname &&
    (input.browserPathname === '/' || input.browserPathname === '/home');
}

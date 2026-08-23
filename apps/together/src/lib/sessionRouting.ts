const PUBLIC_PATHS = new Set(['/', '/auth', '/auth/callback', '/reset-password', '/terms', '/privacy-policy', '/community-guidelines', '/help']);

export function isPublicAppPath(pathname: string) {
  return PUBLIC_PATHS.has(normalizePathname(pathname));
}

export function isLifeSetupPath(pathname: string) {
  const normalized = normalizePathname(pathname);
  return normalized === '/choose-companion' || normalized === '/create/companion';
}

export function safeAppReturnPath(value?: string | string[] | null) {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//')) return null;
  if (/[\r\n\\]/.test(candidate)) return null;
  const pathname = normalizePathname(candidate.split(/[?#]/, 1)[0] ?? candidate);
  return isPublicAppPath(pathname) ? null : candidate;
}

export function signInPathFor(pathname: string) {
  const next = safeAppReturnPath(pathname);
  return next ? `/auth?mode=signin&next=${encodeURIComponent(next)}` : '/auth?mode=signin';
}

export function joinPathFor(pathname?: string) {
  const next = safeAppReturnPath(pathname);
  return next ? `/auth?mode=signup&next=${encodeURIComponent(next)}` : '/auth?mode=signup';
}

function normalizePathname(pathname: string) {
  if (!pathname) return '/';
  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized;
}

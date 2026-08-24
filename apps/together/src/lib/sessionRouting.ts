const PUBLIC_PATHS = new Set(['/', '/auth', '/auth/callback', '/reset-password', '/terms', '/privacy-policy', '/community-guidelines', '/help']);
const ONBOARDING_PATHS = new Set(['/age-confirmation', '/choose-companion']);

export function isPublicAppPath(pathname: string) {
  return PUBLIC_PATHS.has(normalizePathname(pathname));
}

export function isLifeSetupPath(pathname: string) {
  const normalized = normalizePathname(pathname);
  return ONBOARDING_PATHS.has(normalized) || normalized === '/create/companion';
}

export function isAgeConfirmationPath(pathname: string) {
  return normalizePathname(pathname) === '/age-confirmation';
}

export function isCompanionOnboardingPath(pathname: string) {
  return normalizePathname(pathname) === '/choose-companion';
}

export function safeAppReturnPath(value?: string | string[] | null) {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//')) return null;
  if (/[\r\n\\]/.test(candidate)) return null;
  let decoded = candidate;
  try {
    for (let depth = 0; depth < 3; depth += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
  } catch { return null; }
  if (!decoded.startsWith('/') || decoded.startsWith('//') || /[\r\n\\]/.test(decoded)) return null;
  const pathname = normalizePathname(decoded.split(/[?#]/, 1)[0] ?? decoded).toLowerCase();
  if (isPublicAppPath(pathname) || ONBOARDING_PATHS.has(pathname) || pathname.startsWith('/auth/')) return null;
  return candidate;
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

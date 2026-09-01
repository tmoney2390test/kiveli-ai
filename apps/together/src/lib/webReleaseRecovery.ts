const STALE_RELEASE_PATTERNS = [
  /requiring unknown module/i,
  /chunkloaderror/i,
  /loading (?:css )?chunk [^ ]+ failed/i,
  /failed to fetch dynamically imported module/i,
  /importing a module script failed/i,
  /unexpected token ['"]?</i,
  /mime type ['"]?text\/html/i,
];

const RECOVERY_STORAGE_KEY = 'kivelle:web-release-recovery';
const RECOVERY_COOLDOWN_MS = 60_000;
let lastMemoryRecoveryAt = 0;

type RecoveryRecord = { at: number; href: string };
type RecoveryEnvironment = {
  now: () => number;
  href: string;
  reload: () => void;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
};

function errorMessage(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'message' in value) {
    return String((value as { message?: unknown }).message ?? '');
  }
  return '';
}

export function isStaleWebReleaseError(value: unknown): boolean {
  const message = errorMessage(value);
  return Boolean(message && STALE_RELEASE_PATTERNS.some((pattern) => pattern.test(message)));
}

export function staleWebAssetUrl(event: Event): string | null {
  const target = event.target as { src?: unknown; href?: unknown } | null;
  const candidate = typeof target?.src === 'string'
    ? target.src
    : typeof target?.href === 'string'
    ? target.href
    : '';
  if (!candidate) return null;
  try {
    const url = new URL(candidate, typeof window === 'undefined' ? 'https://kivelli.app' : window.location.href);
    return url.pathname.startsWith('/_expo/static/') ? url.toString() : null;
  } catch {
    return null;
  }
}

function defaultEnvironment(): RecoveryEnvironment | null {
  if (typeof window === 'undefined') return null;
  return {
    now: () => Date.now(),
    href: window.location.href,
    reload: () => window.location.reload(),
    storage: window.sessionStorage,
  };
}

function readRecovery(storage: RecoveryEnvironment['storage']): RecoveryRecord | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(RECOVERY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RecoveryRecord>;
    return typeof parsed.at === 'number' && typeof parsed.href === 'string'
      ? { at: parsed.at, href: parsed.href }
      : null;
  } catch {
    return null;
  }
}

/** Reloads the current route once when a deployment invalidates a loaded web bundle. */
export function recoverStaleWebRelease(
  value: unknown,
  environment: RecoveryEnvironment | null = defaultEnvironment(),
): boolean {
  if (!environment || !isStaleWebReleaseError(value)) return false;
  const now = environment.now();
  const prior = readRecovery(environment.storage);
  const lastAttemptAt = Math.max(lastMemoryRecoveryAt, prior?.at ?? 0);
  if (now - lastAttemptAt < RECOVERY_COOLDOWN_MS) return false;
  lastMemoryRecoveryAt = now;
  try {
    environment.storage?.setItem(
      RECOVERY_STORAGE_KEY,
      JSON.stringify({ at: now, href: environment.href } satisfies RecoveryRecord),
    );
  } catch {
    // A blocked sessionStorage must not prevent recovery.
  }
  environment.reload();
  return true;
}

export function recoverStaleWebAssetEvent(event: Event): boolean {
  return staleWebAssetUrl(event)
    ? recoverStaleWebRelease('ChunkLoadError')
    : false;
}

export function reloadCurrentWebRoute(): boolean {
  if (typeof window === 'undefined') return false;
  window.location.reload();
  return true;
}

export function resetWebReleaseRecoveryForTests(): void {
  lastMemoryRecoveryAt = 0;
}

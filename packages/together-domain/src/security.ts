const utf8 = new TextEncoder();

/** Compare secrets without returning early on a differing byte or length. */
export function constantTimeEqual(left: string, right: string): boolean {
  const a = utf8.encode(left);
  const b = utf8.encode(right);
  const length = Math.max(a.length, b.length);
  let difference = a.length ^ b.length;
  for (let index = 0; index < length; index += 1) difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return difference === 0;
}

export function normalizeCorrelationId(value: string | null | undefined, fallback: string = crypto.randomUUID()): string {
  const candidate = value?.trim() ?? '';
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(candidate) ? candidate : fallback;
}

/**
 * Defense-in-depth for URLs returned by external media providers. This blocks
 * obvious loopback, private, link-local and reserved network targets. Callers
 * must re-run this check after every redirect.
 */
export function isSafeExternalHttpsUrl(value: string): boolean {
  let url: URL;
  try { url = new URL(value); } catch { return false; }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return false;
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal') || hostname.endsWith('.lan')) return false;
  if (isBlockedIpv4(hostname) || isBlockedIpv6(hostname)) return false;
  return true;
}

export function matchesDeclaredMediaSignature(bytes: Uint8Array, contentType: string): boolean {
  if (contentType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === 'image/png') return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  if (contentType === 'image/webp') return bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP';
  if (contentType === 'video/mp4') return bytes.length >= 12 && ascii(bytes, 4, 8) === 'ftyp';
  if (contentType === 'video/webm') return bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  return false;
}

export function sniffImageContentType(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (matchesDeclaredMediaSignature(bytes, 'image/png')) return 'image/png';
  if (matchesDeclaredMediaSignature(bytes, 'image/jpeg')) return 'image/jpeg';
  if (matchesDeclaredMediaSignature(bytes, 'image/webp')) return 'image/webp';
  return null;
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

function isBlockedIpv4(hostname: string): boolean {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return false;
  const octets = hostname.split('.').map(Number);
  if (octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const a = octets[0]!;
  const b = octets[1]!;
  const c = octets[2]!;
  return a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && ((b === 0 && [0, 2].includes(c)) || b === 168 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113) || a >= 224;
}

function isBlockedIpv6(hostname: string): boolean {
  if (!hostname.includes(':')) return false;
  const normalized = hostname.toLowerCase();
  if (normalized === '::' || normalized === '::1') return true;
  if (/^(?:fc|fd)/.test(normalized) || /^fe[89ab]/.test(normalized)) return true;
  const mapped = normalized.match(/(?:^|:)ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1];
  return mapped ? isBlockedIpv4(mapped) : false;
}

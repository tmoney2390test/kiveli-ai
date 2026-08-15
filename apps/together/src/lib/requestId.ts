let fallbackSequence = 0;

/**
 * UUID-v4 request identifier that also works in non-secure LAN browser contexts.
 * These IDs provide idempotency, not authentication; server authorization remains
 * session-based.
 */
export function createClientRequestId(): string {
  const cryptoApi = (globalThis as { crypto?: { getRandomValues?: (values: Uint8Array) => Uint8Array } }).crypto;
  let bytes: Uint8Array<ArrayBufferLike> = new Uint8Array(16);
  if (typeof cryptoApi?.getRandomValues === 'function') {
    cryptoApi.getRandomValues(bytes);
  } else {
    fallbackSequence = (fallbackSequence + 1) >>> 0;
    bytes = fallbackBytes(Date.now(), fallbackSequence);
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function fallbackBytes(timestamp: number, sequence: number): Uint8Array {
  const bytes = new Uint8Array(16);
  let state = (timestamp ^ (sequence * 0x9e3779b9) ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  for (let index = 0; index < bytes.length; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    bytes[index] = state & 0xff;
  }
  return bytes;
}

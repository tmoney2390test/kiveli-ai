import { describe, expect, it } from 'vitest';
import { constantTimeEqual, isSafeExternalHttpsUrl, matchesDeclaredMediaSignature, normalizeCorrelationId } from './security.ts';

describe('security helpers', () => {
  it('compares secrets without accepting prefixes or different lengths', () => {
    expect(constantTimeEqual('same-secret', 'same-secret')).toBe(true);
    expect(constantTimeEqual('same-secret', 'same-secret-extra')).toBe(false);
    expect(constantTimeEqual('same-secret', 'same-secreu')).toBe(false);
  });

  it('normalizes untrusted correlation IDs', () => {
    expect(normalizeCorrelationId('client.request-1', 'fallback')).toBe('client.request-1');
    expect(normalizeCorrelationId('line\nbreak', 'fallback')).toBe('fallback');
    expect(normalizeCorrelationId('a'.repeat(129), 'fallback')).toBe('fallback');
  });

  it.each([
    'http://cdn.example.com/photo.jpg',
    'https://localhost/photo.jpg',
    'https://127.0.0.1/photo.jpg',
    'https://127.1/photo.jpg',
    'https://10.0.0.1/photo.jpg',
    'https://169.254.169.254/latest/meta-data',
    'https://192.168.1.5/photo.jpg',
    'https://[::1]/photo.jpg',
    'https://[fd00::1]/photo.jpg',
    'https://cdn.example.com:8443/photo.jpg',
    'https://user:pass@cdn.example.com/photo.jpg',
  ])('rejects unsafe external URL %s', (url) => expect(isSafeExternalHttpsUrl(url)).toBe(false));

  it('accepts a normal public HTTPS provider URL', () => {
    expect(isSafeExternalHttpsUrl('https://cdn.example.com/results/photo.jpg?signature=opaque')).toBe(true);
  });

  it('requires provider media bytes to match their declared type', () => {
    expect(matchesDeclaredMediaSignature(new Uint8Array([0xff, 0xd8, 0xff, 0x00]), 'image/jpeg')).toBe(true);
    expect(matchesDeclaredMediaSignature(new TextEncoder().encode('<script>alert(1)</script>'), 'image/jpeg')).toBe(false);
    expect(matchesDeclaredMediaSignature(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]), 'video/webm')).toBe(true);
  });
});

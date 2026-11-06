import { describe, it, expect } from 'vitest';
import { isHomeArtworkServiceRequest } from './home-artwork-service-auth.ts';
const key = 'server-only-test-key-with-at-least-32-characters';
describe('home artwork service authorization', () => {
  it('accepts an exact server credential only on POST', () => {
    expect(isHomeArtworkServiceRequest(new Request('https://example.invalid', {method:'POST', headers:{'x-kivelli-home-dispatch-secret':key}}), [undefined, key])).toBe(true);
    expect(isHomeArtworkServiceRequest(new Request('https://example.invalid', {headers:{'x-kivelli-home-dispatch-secret':key}}), [key])).toBe(false);
  });
  it('rejects missing configuration, missing auth and ordinary user tokens', () => {
    for (const authorization of ['', 'Bearer user-session-jwt', `Bearer ${key}x`, `Basic ${key}`]) {
      expect(isHomeArtworkServiceRequest(new Request('https://example.invalid', {method:'POST', headers:{authorization}}), [key])).toBe(false);
    }
    expect(isHomeArtworkServiceRequest(new Request('https://example.invalid', {method:'POST', headers:{authorization:`Bearer ${key}`}}), [undefined, ''])).toBe(false);
    expect(isHomeArtworkServiceRequest(new Request('https://example.invalid', {method:'POST', headers:{'x-kivelli-home-dispatch-secret':`${key}x`}}), [key])).toBe(false);
  });
});

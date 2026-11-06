import { constantTimeEqual } from '../../../packages/together-domain/src/security.ts';

/** Catalog release tooling only. Ordinary user JWTs and publishable keys cannot run paid jobs. */
export function isHomeArtworkServiceRequest(request: Request, expectedKeys: Array<string | null | undefined>): boolean {
  if (request.method !== 'POST') return false;
  const token = request.headers.get('x-kivelli-home-dispatch-secret');
  if (!token) return false;
  return expectedKeys.some(key => Boolean(key && key.length >= 32 && constantTimeEqual(token, key)));
}

import { assertEquals } from 'jsr:@std/assert@1';
import { assuranceForValidatedToken } from './context.ts';

Deno.test('assurance parser fails closed for malformed or missing claims', () => {
  const token = (claims: unknown) => `header.${btoa(JSON.stringify(claims))}.signature`;
  for (const input of ['', 'invalid', 'a.bad.c', token({}), token({ aal: 'aal1' }), token({ aal: true }), token({ aal: 'AAL2' })]) {
    assertEquals(assuranceForValidatedToken(input), 'aal1');
  }
  // Parsing does not validate signatures; authenticated() first calls getUser on the same token.
  assertEquals(assuranceForValidatedToken(token({ aal: 'aal2' })), 'aal2');
});

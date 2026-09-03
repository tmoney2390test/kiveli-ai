import { assertEquals } from 'jsr:@std/assert@1';
import { jwtSubjectFromAccessToken, serverSecretLooksUsable } from './context.ts';

function tokenWithPayload(payload:Record<string,unknown>):string{
  const encoded=btoa(JSON.stringify(payload)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  return`header.${encoded}.signature`;
}

Deno.test('authenticated request preloading accepts only a UUID token subject',()=>{
  const userId='3cfdfecc-3be4-4cf5-8a86-d6bf6fa596e5';
  assertEquals(jwtSubjectFromAccessToken(tokenWithPayload({sub:userId})),userId);
  assertEquals(jwtSubjectFromAccessToken(tokenWithPayload({sub:'not-a-user'})),null);
  assertEquals(jwtSubjectFromAccessToken('malformed'),null);
});

Deno.test('server credentials reject publishable, redacted, and non-ASCII values',()=>{
  assertEquals(serverSecretLooksUsable('sb_secret_actualAsciiValue123'),true);
  assertEquals(serverSecretLooksUsable('eyJhbGciOiJIUzI1NiJ9.legacy-service-role.signature'),true);
  assertEquals(serverSecretLooksUsable('sb_publishable_not-a-server-secret'),false);
  assertEquals(serverSecretLooksUsable('sb_secret_redacted…ending'),false);
  assertEquals(serverSecretLooksUsable('sb_secret_redacted****'),false);
});

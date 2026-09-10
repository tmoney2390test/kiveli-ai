import {assertEquals,assertRejects,assertNotEquals} from 'jsr:@std/assert@1';
import type {User} from '@supabase/supabase-js';
import {appleSubjectMatches,appleClientId,sealAppleToken,unsealAppleToken} from './kivelle-apple-auth.ts';
Deno.test('Apple encrypted credentials bind to account and client',async()=>{
  const key=btoa('01234567890123456789012345678901');
  const sealed=await sealAppleToken('synthetic-refresh-token','a','app.test',key);
  assertNotEquals(sealed,await sealAppleToken('synthetic-refresh-token','a','app.test',key));
  assertEquals(sealed.includes('synthetic-refresh-token'),false);
  assertEquals(await unsealAppleToken(sealed,'a','app.test',key),'synthetic-refresh-token');
  await assertRejects(()=>unsealAppleToken(sealed,'b','app.test',key));
  await assertRejects(()=>unsealAppleToken(sealed,'a','other.app',key));
});
Deno.test('Apple identity uses verified linked subject not user metadata',()=>{
  const user={identities:[{id:'identity-id',provider:'apple',identity_data:{sub:'apple-sub'}}]} as unknown as Pick<User,'identities'>;
  assertEquals(appleSubjectMatches(user,'apple-sub'),true);
  assertEquals(appleSubjectMatches(user,'other-sub'),false);
  assertEquals(appleSubjectMatches({identities:[]},'apple-sub'),false);
  assertEquals(appleClientId('native',name=>name==='KIVELLE_APPLE_CLIENT_ID'?'app.test':undefined),'app.test');
});

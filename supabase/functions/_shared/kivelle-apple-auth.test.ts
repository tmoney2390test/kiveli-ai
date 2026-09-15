import {assertEquals,assertRejects,assertNotEquals} from 'jsr:@std/assert@1';
import type {User} from '@supabase/supabase-js';
import {appleSubjectMatches,appleClientId,sealAppleToken,unsealAppleToken,readAppleSetting} from './kivelle-apple-auth.ts';
Deno.test('Apple encrypted credentials bind to account and client',async()=>{
  const key=btoa('01234567890123456789012345678901');
  const sealed=await sealAppleToken('synthetic-refresh-token','a','app.test',key);
  assertNotEquals(sealed,await sealAppleToken('synthetic-refresh-token','a','app.test',key));
  assertEquals(sealed.includes('synthetic-refresh-token'),false);
  assertEquals(await unsealAppleToken(sealed,'a','app.test',key),'synthetic-refresh-token');
  await assertRejects(()=>unsealAppleToken(sealed,'b','app.test',key));
  await assertRejects(()=>unsealAppleToken(sealed,'a','other.app',key));
});
Deno.test('Apple grouped settings preserve individual overrides and reject unsafe values',async()=>{
  const packed=JSON.stringify({KIVELLE_APPLE_CLIENT_ID:'app.test',KIVELLE_APPLE_PRIVATE_KEY:'line1\nline2',KIVELLE_APPLE_KEY_ID:123,UNRELATED:'hidden'});
  const read=(name:string)=>name==='KIVELLE_APPLE_CONFIG_JSON'?packed:undefined;
  assertEquals(readAppleSetting('KIVELLE_APPLE_CLIENT_ID',read),'app.test');
  assertEquals(readAppleSetting('KIVELLE_APPLE_PRIVATE_KEY',read),'line1\nline2');
  assertEquals(readAppleSetting('KIVELLE_APPLE_KEY_ID',read),undefined);
  assertEquals(readAppleSetting('UNRELATED',read),undefined);
  assertEquals(readAppleSetting('KIVELLE_APPLE_CLIENT_ID',name=>name==='KIVELLE_APPLE_CLIENT_ID'?'override':read(name)),'override');
  await assertRejects(async()=>readAppleSetting('KIVELLE_APPLE_CLIENT_ID',name=>name==='KIVELLE_APPLE_CONFIG_JSON'?'{broken':undefined),Error,'Apple account recovery is not configured');
});
Deno.test('Apple identity uses verified linked subject not user metadata',()=>{
  const user={identities:[{id:'identity-id',provider:'apple',identity_data:{sub:'apple-sub'}}]} as unknown as Pick<User,'identities'>;
  assertEquals(appleSubjectMatches(user,'apple-sub'),true);
  assertEquals(appleSubjectMatches(user,'other-sub'),false);
  assertEquals(appleSubjectMatches({identities:[]},'apple-sub'),false);
  assertEquals(appleClientId('native',name=>name==='KIVELLE_APPLE_CLIENT_ID'?'app.test':undefined),'app.test');
});

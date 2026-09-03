import { assert, assertFalse } from 'jsr:@std/assert@1';
import { adultMediaJobAuthorizationValid } from './web-adult-access.ts';

const now=Date.parse('2026-09-02T21:00:00-04:00');

Deno.test('adult media revalidation accepts an active paid eligible web session',()=>{
  assert(adultMediaJobAuthorizationValid({tier:'kivelle_max',adultEligibleAt:'2026-08-28T10:25:36-04:00',session:{adult_mode_enabled:true,expires_at:'2026-10-01T21:56:34-04:00',revoked_at:null}},now));
});

Deno.test('adult media revalidation fails closed for free, disabled, expired, or revoked access',()=>{
  const active={adult_mode_enabled:true,expires_at:'2026-10-01T21:56:34-04:00',revoked_at:null};
  assertFalse(adultMediaJobAuthorizationValid({tier:'free',adultEligibleAt:'2026-08-28T10:25:36-04:00',session:active},now));
  assertFalse(adultMediaJobAuthorizationValid({tier:'kivelle_max',adultEligibleAt:null,session:active},now));
  assertFalse(adultMediaJobAuthorizationValid({tier:'kivelle_max',adultEligibleAt:'2026-08-28T10:25:36-04:00',session:{...active,adult_mode_enabled:false}},now));
  assertFalse(adultMediaJobAuthorizationValid({tier:'kivelle_max',adultEligibleAt:'2026-08-28T10:25:36-04:00',session:{...active,expires_at:'2026-09-01T00:00:00-04:00'}},now));
  assertFalse(adultMediaJobAuthorizationValid({tier:'kivelle_max',adultEligibleAt:'2026-08-28T10:25:36-04:00',session:{...active,revoked_at:'2026-09-02T20:00:00-04:00'}},now));
});

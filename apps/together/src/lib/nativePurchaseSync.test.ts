import{describe,expect,it,vi}from'vitest';
import{waitForAuthoritativeRestore}from'./nativePurchaseSync';
import type{SubscriptionStatus}from'./subscription';

const paid={tier:'kivelle_plus',capabilities:{displayName:'Kivelle+'}} as SubscriptionStatus;
const free={tier:'free'} as SubscriptionStatus;
const options={delays:[0,1,1],sleep:vi.fn(()=>Promise.resolve())};

describe('authoritative native restore reconciliation',()=>{
  it('waits through stale free state until the signed entitlement arrives',async()=>{
    const refetch=vi.fn().mockResolvedValueOnce({data:free}).mockResolvedValueOnce({data:paid});
    expect(await waitForAuthoritativeRestore(refetch,options)).toMatchObject({state:'active',data:paid});
  });
  it('requires repeated free responses before saying no purchase exists',async()=>{
    expect(await waitForAuthoritativeRestore(vi.fn().mockResolvedValue({data:free}),options)).toEqual({state:'verified_none'});
  });
  it('treats timeouts and incomplete responses as syncing, not no purchase',async()=>{
    expect(await waitForAuthoritativeRestore(vi.fn().mockRejectedValue(new Error('timeout')),options)).toEqual({state:'syncing'});
    expect(await waitForAuthoritativeRestore(vi.fn().mockResolvedValue({}),{...options,delays:[0]})).toEqual({state:'syncing'});
  });
});

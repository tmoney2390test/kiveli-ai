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
  it('never treats repeated stale free responses as proof of no purchase',async()=>{
    expect(await waitForAuthoritativeRestore(vi.fn().mockResolvedValue({data:free}),options)).toEqual({state:'syncing'});
  });
  it('only accepts an explicit provider-verified empty account',async()=>{
    expect(await waitForAuthoritativeRestore(()=>Promise.resolve({data:free,verification:'verified_none' as const}),options)).toEqual({state:'verified_none',data:free});
  });
  it('treats timeouts and incomplete responses as syncing, not no purchase',async()=>{
    expect(await waitForAuthoritativeRestore(vi.fn().mockRejectedValue(new Error('timeout')),options)).toEqual({state:'syncing'});
    expect(await waitForAuthoritativeRestore(vi.fn().mockResolvedValue({}),{...options,delays:[0]})).toEqual({state:'syncing'});
  });
});

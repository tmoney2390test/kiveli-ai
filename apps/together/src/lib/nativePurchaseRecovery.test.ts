import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({user:'a',values:new Map<string,string>(),invoke:vi.fn()}));
vi.mock('@react-native-async-storage/async-storage',()=>({default:{
  getItem:(key:string)=>Promise.resolve(mocks.values.get(key)??null),
  setItem:(key:string,value:string)=>{mocks.values.set(key,value);return Promise.resolve();},
  removeItem:(key:string)=>{mocks.values.delete(key);return Promise.resolve();}
}}));
vi.mock('./api',()=>({invoke:mocks.invoke}));
vi.mock('./supabase',()=>({supabase:{auth:{getSession:()=>Promise.resolve({data:{session:{user:{id:mocks.user}}}})}}}));
vi.mock('./nativePurchaseSync',()=>({waitForAuthoritativeRestore:async(fn:()=>Promise<{data?:{tier:string};verification?:string}>)=>{
  const r=await fn();return r.verification==='verified_none'?{state:'verified_none',data:r.data}:r.data?.tier&&r.data.tier!=='free'?{state:'active',data:r.data}:{state:'syncing'};
}}));
import {readPendingPurchase,resumeNativePurchase,savePendingPurchase} from './nativePurchaseRecovery';
beforeEach(()=>{mocks.user='a';mocks.values.clear();mocks.invoke.mockReset();});
describe('durable store recovery',()=>{
  it('coalesces duplicate reconciliation and clears only verified active state',async()=>{
    await savePendingPurchase('a',{kind:'purchase',targetTier:'kivelle_max',startedAt:1});
    mocks.invoke.mockResolvedValue({state:{tier:'kivelle_max'},verification:'active'});
    const first=resumeNativePurchase('a'),second=resumeNativePurchase('a');expect(first).toBe(second);
    expect((await first).state).toBe('active');expect(await readPendingPurchase('a')).toBeNull();expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });
  it('keeps unfinished store purchases even when provider snapshot is empty',async()=>{
    await savePendingPurchase('a',{kind:'purchase',targetTier:'kivelle_max',startedAt:1,storePending:true});
    mocks.invoke.mockResolvedValue({state:{tier:'free'},verification:'verified_none'});
    expect((await resumeNativePurchase('a')).state).toBe('syncing');expect(await readPendingPurchase('a')).not.toBeNull();
  });
  it('does not confuse an existing Plus membership with a completed Max upgrade',async()=>{
    await savePendingPurchase('a',{kind:'purchase',targetTier:'kivelle_max',startedAt:1});
    mocks.invoke.mockResolvedValue({state:{tier:'kivelle_plus'},verification:'active'});
    expect((await resumeNativePurchase('a')).state).toBe('syncing');
  });
  it('stops before provider reconciliation after account switch',async()=>{
    await savePendingPurchase('a',{kind:'restore',startedAt:1});mocks.user='b';
    await expect(resumeNativePurchase('a')).rejects.toThrow('account changed');expect(mocks.invoke).not.toHaveBeenCalled();
    expect(await readPendingPurchase('a')).not.toBeNull();
  });
  it('accepts verified no purchase only after a restore without a contrary store signal',async()=>{
    await savePendingPurchase('a',{kind:'restore',startedAt:1});
    mocks.invoke.mockResolvedValue({state:{tier:'free'},verification:'verified_none'});
    expect((await resumeNativePurchase('a')).state).toBe('verified_none');expect(await readPendingPurchase('a')).toBeNull();
  });
});

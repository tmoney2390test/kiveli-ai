import {afterEach,describe,expect,it,vi} from 'vitest';
import {ensureAiConsent,installAiConsentHandler,invalidateAiConsent,isAiFeatureRequest} from './aiConsent';
afterEach(()=>invalidateAiConsent());
describe('AI sharing request boundary',()=>{
  it('does not repeat valid consent and does not carry it to another account',async()=>{
    const handler=vi.fn(()=>Promise.resolve(true)),remove=installAiConsentHandler(handler);
    await ensureAiConsent('a');await ensureAiConsent('a');await ensureAiConsent('b');
    expect(handler.mock.calls).toEqual([['a',false],['b',false]]);remove();
    expect(await ensureAiConsent('b')).toBe(false);
  });
  it('review bypasses cache and withdrawal stops subsequent calls',async()=>{
    const handler=vi.fn().mockResolvedValueOnce(true).mockResolvedValue(false),remove=installAiConsentHandler(handler);
    expect(await ensureAiConsent('a')).toBe(true);
    expect(await ensureAiConsent('a',true)).toBe(false);
    expect(await ensureAiConsent('a')).toBe(false);remove();
  });
  it('covers AI actions without blocking account/history/settings',()=>{
    expect(isAiFeatureRequest('together-creator',{action:'complete_draft_appearance_upload'})).toBe(true);
    expect(isAiFeatureRequest('together-dialogue',{})).toBe(true);
    expect(isAiFeatureRequest('together-account',{action:'delete'})).toBe(false);
    expect(isAiFeatureRequest('together-conversation',{action:'history'})).toBe(false);
    expect(isAiFeatureRequest('together-call',{action:'status'})).toBe(false);
  });
});

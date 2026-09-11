import {afterEach,describe,expect,it,vi} from 'vitest';
import {AiConsentCheckError,ensureAiConsent,installAiConsentHandler,invalidateAiConsent,isAiFeatureRequest} from './aiConsent';
afterEach(()=>invalidateAiConsent());
describe('AI sharing request boundary',()=>{
  it('does not repeat valid consent and does not carry it to another account',async()=>{
    const handler=vi.fn(()=>Promise.resolve(true)),remove=installAiConsentHandler(handler);
    await ensureAiConsent('a');await ensureAiConsent('a');await ensureAiConsent('b');
    expect(handler.mock.calls).toEqual([['a',false],['b',false]]);remove();
    await expect(ensureAiConsent('b')).rejects.toMatchObject({code:'CONSENT_CHECK_UNAVAILABLE',retryable:true});
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
  it('rechecks consent invalidated during a background/resume transition',async()=>{
    const handler=vi.fn().mockImplementationOnce(()=>{invalidateAiConsent();return Promise.resolve(true);}).mockResolvedValue(true);
    const remove=installAiConsentHandler(handler);
    try{expect(await ensureAiConsent('a')).toBe(true);expect(handler).toHaveBeenCalledTimes(2);}
    finally{remove();}
  });
  it('does not accept a stale allowed result if the recheck is declined',async()=>{
    const handler=vi.fn().mockImplementationOnce(()=>{invalidateAiConsent();return Promise.resolve(true);}).mockResolvedValue(false);
    const remove=installAiConsentHandler(handler);
    try{expect(await ensureAiConsent('a')).toBe(false);expect(handler).toHaveBeenCalledTimes(2);}
    finally{remove();}
  });
  it('caps lifecycle retries and reports unavailable, never a fabricated decline',async()=>{
    const handler=vi.fn(()=>{invalidateAiConsent();return Promise.resolve(true);}),remove=installAiConsentHandler(handler);
    try{await expect(ensureAiConsent('a')).rejects.toBeInstanceOf(AiConsentCheckError);expect(handler).toHaveBeenCalledTimes(2);}
    finally{remove();}
  });
  it('recovers once from a temporary lookup failure without changing consent',async()=>{
    const handler=vi.fn().mockRejectedValueOnce(new TypeError('network failure')).mockResolvedValue(true),remove=installAiConsentHandler(handler);
    try{expect(await ensureAiConsent('a')).toBe(true);expect(handler).toHaveBeenCalledTimes(2);}
    finally{remove();}
  });
  it('does not turn persistent lookup failures into CONSENT_REQUIRED',async()=>{
    const handler=vi.fn().mockRejectedValue({code:'INTERNAL_ERROR',retryable:true}),remove=installAiConsentHandler(handler);
    try{await expect(ensureAiConsent('a')).rejects.toMatchObject({code:'CONSENT_CHECK_UNAVAILABLE',retryable:true});expect(handler).toHaveBeenCalledTimes(2);}
    finally{remove();}
  });
  it('preserves authentication failures without retrying or calling them consent failures',async()=>{
    const error={code:'AUTH_REQUIRED',retryable:false},handler=vi.fn().mockRejectedValue(error),remove=installAiConsentHandler(handler);
    try{await expect(ensureAiConsent('a')).rejects.toBe(error);expect(handler).toHaveBeenCalledTimes(1);}
    finally{remove();}
  });
  it('does not retry an actual declined choice',async()=>{
    const handler=vi.fn().mockResolvedValue(false),remove=installAiConsentHandler(handler);
    try{expect(await ensureAiConsent('a')).toBe(false);expect(handler).toHaveBeenCalledTimes(1);}
    finally{remove();}
  });
  it('rejects an old account result after its bridge has been replaced',async()=>{
    let resolve!:(value:boolean)=>void;
    const removeOld=installAiConsentHandler(()=>new Promise<boolean>(done=>{resolve=done;}));
    const result=ensureAiConsent('a');
    const rejected=expect(result).rejects.toBeInstanceOf(AiConsentCheckError);
    removeOld();
    const replacement=vi.fn().mockResolvedValue(false),removeNew=installAiConsentHandler(replacement);
    try{resolve(true);await rejected;expect(replacement).not.toHaveBeenCalled();expect(await ensureAiConsent('b')).toBe(false);}
    finally{removeNew();}
  });
  it('a stale bridge cleanup cannot clear its replacement or retain the old cache',async()=>{
    const removeOld=installAiConsentHandler(()=>Promise.resolve(true));
    expect(await ensureAiConsent('a')).toBe(true);
    const replacement=vi.fn().mockResolvedValue(false),removeNew=installAiConsentHandler(replacement);
    try{removeOld();expect(await ensureAiConsent('a')).toBe(false);expect(replacement).toHaveBeenCalledOnce();}
    finally{removeNew();}
  });
  it('a lifecycle recheck after manual review does not open a second review',async()=>{
    const handler=vi.fn().mockImplementationOnce(()=>{invalidateAiConsent();return Promise.resolve(true);}).mockResolvedValue(true),remove=installAiConsentHandler(handler);
    try{expect(await ensureAiConsent('a',true)).toBe(true);expect(handler.mock.calls).toEqual([['a',true],['a',false]]);}
    finally{remove();}
  });
});

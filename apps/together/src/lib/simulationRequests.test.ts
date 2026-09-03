import { afterEach, describe, expect, it, vi } from 'vitest';
import { coalesceSimulationRequest, resetSimulationRequestCache } from './simulationRequests';

afterEach(()=>resetSimulationRequestCache());

describe('simulation request coalescing',()=>{
  it('shares one request across home and chat mounts',async()=>{
    let resolveRequest:(value:string)=>void=()=>undefined;
    const run=vi.fn(()=>new Promise<string>((resolve)=>{resolveRequest=resolve;}));
    const first=coalesceSimulationRequest('companion',run,{now:100_000});
    const second=coalesceSimulationRequest('companion',run,{now:100_001});
    expect(run).toHaveBeenCalledTimes(1);
    resolveRequest('ready');
    await expect(Promise.all([first,second])).resolves.toEqual(['ready','ready']);
  });

  it('skips another successful refresh during the cooldown',async()=>{
    const run=vi.fn().mockResolvedValue('ready');
    await coalesceSimulationRequest('companion',run,{now:100_000,cooldownMs:90_000});
    await expect(coalesceSimulationRequest('companion',run,{now:100_100,cooldownMs:90_000})).resolves.toBeUndefined();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('allows an immediate retry after failure',async()=>{
    const run=vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce('ready');
    await expect(coalesceSimulationRequest('companion',run,{now:100_000})).rejects.toThrow('offline');
    await expect(coalesceSimulationRequest('companion',run,{now:100_001})).resolves.toBe('ready');
    expect(run).toHaveBeenCalledTimes(2);
  });
});

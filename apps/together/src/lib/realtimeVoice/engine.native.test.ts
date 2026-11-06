import { afterEach, describe, expect, it, vi } from 'vitest';
const native = vi.hoisted(() => {
  const events = new Map<string, (event: {turnId: string})=>void>();
  return {events,Pipeline:{connect:vi.fn(()=>Promise.resolve()),disconnect:vi.fn(()=>Promise.resolve()),onError:vi.fn(()=>({remove:vi.fn()})),onAudioFocus:vi.fn(()=>({remove:vi.fn()})),subscribe:vi.fn((name:string,cb:(event: {turnId: string})=>void)=>{events.set(name,cb);return{remove:()=>events.delete(name)};}),getTelemetry:vi.fn(()=>({turnId:'a',totalWritten:24000,totalRead:12000})),getOutputLatencyMs:vi.fn(()=>80),pushAudioSync:vi.fn(),invalidateTurn:vi.fn(()=>Promise.resolve())},PlaybackModes:{CONVERSATION:'conversation'},ExpoPlayAudioStream:{startMicrophone:vi.fn(()=>Promise.resolve({subscription:{remove:vi.fn()}})),stopMicrophone:vi.fn(()=>Promise.resolve(null))}};
});
vi.mock('@edkimmel/expo-audio-stream',()=>native);
vi.mock('expo-audio',()=>({setAudioModeAsync:vi.fn(()=>Promise.resolve())}));
vi.mock('expo-file-system',()=>({File:class{}}));
import { PlatformRealtimeAudioEngine } from './engine';
afterEach(()=>{vi.useRealTimers();vi.clearAllMocks();native.events.clear();});
describe('native call caption compatibility',()=>{
  it('tracks consumed samples, falls back without new latency API, and stops polling on hangup',async()=>{
    vi.useFakeTimers();const engine=new PlatformRealtimeAudioEngine(),onPlayback=vi.fn();
    await engine.open({sampleRate:24000,onInput:vi.fn(),onError:vi.fn(),onPlayback});
    native.Pipeline.getOutputLatencyMs.mockImplementation(()=>{throw Error('older native module');});
    native.events.get('PipelinePlaybackStarted')!({turnId:'a'});vi.advanceTimersByTime(60);
    expect(onPlayback).toHaveBeenLastCalledWith({turnId:'a',playedMs:420,totalMs:1000,done:false});
    native.events.get('PipelineDrained')!({turnId:'a'});vi.advanceTimersByTime(80);
    expect(onPlayback).toHaveBeenLastCalledWith({turnId:'a',playedMs:1000,totalMs:1000,done:true});
    expect(vi.getTimerCount()).toBe(0);await engine.close();
    expect(native.Pipeline.disconnect).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);
  });
  it('does not crash the call if optional caption telemetry is unavailable',async()=>{
    vi.useFakeTimers();const engine=new PlatformRealtimeAudioEngine(),onError=vi.fn();
    await engine.open({sampleRate:24000,onInput:vi.fn(),onError});
    native.Pipeline.getTelemetry.mockImplementationOnce(()=>{throw Error('unavailable');});
    native.events.get('PipelinePlaybackStarted')!({turnId:'a'});
    expect(()=>vi.advanceTimersByTime(60)).not.toThrow();expect(onError).not.toHaveBeenCalled();
    await engine.interrupt('a');expect(vi.getTimerCount()).toBe(0);await engine.close();
  });
  it('ignores incomplete sample counts from older native builds',async()=>{
    vi.useFakeTimers();const engine=new PlatformRealtimeAudioEngine(),onPlayback=vi.fn();
    await engine.open({sampleRate:24000,onInput:vi.fn(),onError:vi.fn(),onPlayback});
    native.Pipeline.getTelemetry.mockReturnValueOnce({turnId:'a',totalWritten:NaN,totalRead:NaN});
    native.events.get('PipelinePlaybackStarted')!({turnId:'a'});vi.advanceTimersByTime(60);
    expect(onPlayback).not.toHaveBeenCalled();await engine.close();
  });
});

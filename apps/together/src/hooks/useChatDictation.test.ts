import { beforeEach, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ effects: [] as Array<() => void>, permission: vi.fn(), mode: vi.fn(), prepare: vi.fn(), record: vi.fn() }));
vi.mock('react', () => ({ useRef: (current: unknown) => ({ current }), useState: (value: unknown) => [value, vi.fn()], useCallback: (fn: unknown) => fn, useEffect: (fn: () => (() => void)) => { const cleanup=fn(); if(cleanup)h.effects.push(cleanup); } }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('expo-file-system', () => ({ File: class { exists=false; delete(){} } }));
vi.mock('expo-audio', () => ({ RecordingPresets: { HIGH_QUALITY: {} }, requestRecordingPermissionsAsync: h.permission, setAudioModeAsync: h.mode, useAudioRecorder: () => ({ prepareToRecordAsync:h.prepare,record:h.record }), useAudioRecorderState: () => ({ durationMillis:0 }) }));
vi.mock('../lib/api', () => ({ transcribeChatAudio: vi.fn() }));
import { useChatDictation } from './useChatDictation';
function mount(){return useChatDictation({conversationId:'one',characterInstanceId:'character',onTranscript:vi.fn(),onError:vi.fn()});}
function unmount(){h.effects.forEach(fn=>fn());}
beforeEach(()=>{vi.clearAllMocks();h.effects=[];h.permission.mockResolvedValue({granted:true});h.mode.mockResolvedValue(undefined);h.prepare.mockResolvedValue(undefined);});
it('does not touch a released recorder after delayed microphone permission',async()=>{
 let resolve!:(v:unknown)=>void;h.permission.mockImplementation(()=>new Promise(r=>resolve=r));
 const hook=mount(),pending=hook.toggle();unmount();resolve({granted:true});await pending;
 expect(h.prepare).not.toHaveBeenCalled();expect(h.record).not.toHaveBeenCalled();
});
it('does not record when preparation completes after navigation away',async()=>{
 let resolve!:()=>void;h.prepare.mockImplementation(()=>new Promise<void>(r=>resolve=r));
 const hook=mount(),pending=hook.toggle();await vi.waitFor(()=>expect(h.prepare).toHaveBeenCalledOnce());
 unmount();resolve();await pending;expect(h.record).not.toHaveBeenCalled();
});
it('serializes rapid microphone taps while permission is pending',async()=>{
 let resolve!:(v:unknown)=>void;h.permission.mockImplementation(()=>new Promise(r=>resolve=r));
 const hook=mount(),pending=hook.toggle();await hook.toggle();expect(h.permission).toHaveBeenCalledOnce();
 unmount();resolve({granted:true});await pending;
});

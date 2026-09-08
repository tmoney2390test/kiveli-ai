import { describe, expect, it } from 'vitest';
import { DIALOGUE_RECOVERY_DELAYS_MS, STALE_DIALOGUE_REPLAY_AFTER_MS, dialogueFailureMayHavePersisted, dialogueRecoveryShouldContinue, latestUnansweredDialogueRequest, persistedDialogueResponseForRequest, staleDialogueReplayDelay } from './dialogueRecovery';

describe('dialogue failure recovery',()=>{
  it('keeps checking beyond a slow fifteen-second first token',()=>{
    expect(DIALOGUE_RECOVERY_DELAYS_MS.reduce((sum,delay)=>sum+delay,0)).toBeGreaterThan(20_000);
  });
  it('reconciles native fetch failures because the server outcome is unknown',()=>{
    expect(dialogueFailureMayHavePersisted(new TypeError('Failed to fetch'))).toBe(true);
    expect(dialogueFailureMayHavePersisted({name:'AbortError',message:'The operation was aborted'})).toBe(true);
    expect(dialogueFailureMayHavePersisted(new Error('NetworkError when attempting to fetch resource.'))).toBe(true);
  });

  it('reconciles interrupted, timed out, and retryable provider responses',()=>{
    expect(dialogueFailureMayHavePersisted({code:'STREAM_INTERRUPTED'})).toBe(true);
    expect(dialogueFailureMayHavePersisted({code:'PROVIDER_TIMEOUT'})).toBe(true);
    expect(dialogueFailureMayHavePersisted({code:'CUSTOM_RETRY',retryable:true})).toBe(true);
  });

  it('does not poll after deterministic client errors',()=>{
    expect(dialogueFailureMayHavePersisted({code:'VALIDATION_FAILED',message:'Write a message.'})).toBe(false);
    expect(dialogueFailureMayHavePersisted(new Error('Write a message.'))).toBe(false);
  });

  it('stops recovery as soon as the server confirms that request is no longer active',()=>{
    expect(dialogueRecoveryShouldContinue({pending:false,requestId:null},'request-1')).toBe(false);
    expect(dialogueRecoveryShouldContinue({pending:true,requestId:'newer-request'},'request-1')).toBe(false);
    expect(dialogueRecoveryShouldContinue({pending:true,requestId:'request-1'},'request-1')).toBe(true);
    expect(dialogueRecoveryShouldContinue(undefined,'request-1')).toBe(true);
  });

  it('recovers a persisted photo-only response after the terminal stream event is lost',()=>{
    const messages=[
      {id:'older-reply',role:'assistant',content:'Earlier'},
      {id:'request',role:'user',content:'Send me a photo',client_request_id:'request-1'},
      {id:'photo-reply',role:'assistant',content:'[Photo]'},
    ];
    expect(persistedDialogueResponseForRequest(messages,'request-1')?.id).toBe('photo-reply');
  });

  it('does not mistake an older assistant message for the interrupted response',()=>{
    const messages=[
      {id:'older-reply',role:'assistant',content:'Earlier'},
      {id:'request',role:'user',content:'Send me a photo',client_request_id:'request-1'},
    ];
    expect(persistedDialogueResponseForRequest(messages,'request-1')).toBeNull();
  });

  it('finds a persisted user turn that has no later response',()=>{
    const messages=[
      {id:'older-reply',role:'assistant',delivery_status:'complete',created_at:'2026-09-05T20:00:00Z'},
      {id:'request',role:'user',delivery_status:'complete',created_at:'2026-09-05T20:01:00Z',client_request_id:'request-1'},
    ];
    expect(latestUnansweredDialogueRequest(messages)?.id).toBe('request');
    expect(staleDialogueReplayDelay(messages[1]!,Date.parse('2026-09-05T20:01:00Z')+STALE_DIALOGUE_REPLAY_AFTER_MS-1_000)).toBe(1_000);
    expect(staleDialogueReplayDelay(messages[1]!,Date.parse('2026-09-05T20:10:00Z'))).toBe(0);
  });

  it('does not replay answered, failed, or hidden control turns',()=>{
    expect(latestUnansweredDialogueRequest([
      {role:'user',delivery_status:'complete',created_at:'2026-09-05T20:01:00Z',client_request_id:'request-1'},
      {role:'assistant',delivery_status:'complete',created_at:'2026-09-05T20:01:05Z'},
    ])).toBeNull();
    expect(latestUnansweredDialogueRequest([
      {role:'user',delivery_status:'failed',created_at:'2026-09-05T20:01:00Z',client_request_id:'request-1'},
    ])).toBeNull();
    expect(latestUnansweredDialogueRequest([
      {role:'user',delivery_status:'complete',created_at:'2026-09-05T20:01:00Z',client_request_id:'request-1',provider_metadata:{uiHidden:true}},
    ])).toBeNull();
  });
});

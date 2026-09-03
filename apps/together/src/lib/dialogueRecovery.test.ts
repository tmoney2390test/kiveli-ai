import { describe, expect, it } from 'vitest';
import { dialogueFailureMayHavePersisted, persistedDialogueResponseForRequest } from './dialogueRecovery';

describe('dialogue failure recovery',()=>{
  it('reconciles native fetch failures because the server outcome is unknown',()=>{
    expect(dialogueFailureMayHavePersisted(new TypeError('Failed to fetch'))).toBe(true);
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
});

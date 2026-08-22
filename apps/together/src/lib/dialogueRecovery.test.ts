import { describe, expect, it } from 'vitest';
import { dialogueFailureMayHavePersisted } from './dialogueRecovery';

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
});

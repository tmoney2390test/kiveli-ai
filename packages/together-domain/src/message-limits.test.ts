import { describe, expect, it } from 'vitest';
import {
  MESSAGE_CHARACTER_LIMIT,
  messageCharacterLimitError,
  messageCharacterState,
} from './message-limits';

describe('message character limits', () => {
  it('reveals the counter at 1,600 and warns at 1,800 characters', () => {
    expect(messageCharacterState('a'.repeat(1_599))).toMatchObject({ showCounter: false, tone: 'normal' });
    expect(messageCharacterState('a'.repeat(1_600))).toMatchObject({ showCounter: true, tone: 'normal' });
    expect(messageCharacterState('a'.repeat(1_800))).toMatchObject({ showCounter: true, tone: 'warning' });
  });

  it('allows exactly 2,000 characters and rejects anything longer', () => {
    expect(messageCharacterState('a'.repeat(MESSAGE_CHARACTER_LIMIT))).toMatchObject({ overLimit: false, tone: 'danger', remaining: 0 });
    expect(messageCharacterState('a'.repeat(MESSAGE_CHARACTER_LIMIT + 1))).toMatchObject({ overLimit: true, tone: 'danger', remaining: -1 });
  });

  it('provides the user-facing limit error', () => {
    expect(messageCharacterLimitError()).toBe('Messages can be up to 2,000 characters.');
  });
});

import{describe,expect,it}from'vitest';
import{storedVoiceNoteConfirmationHidden,voiceNoteConfirmationKey}from'./voiceNoteConfirmationPreference';

describe('voice note confirmation preference',()=>{
  it('is visible by default and hides only after an explicit stored choice',()=>{
    expect(storedVoiceNoteConfirmationHidden(null)).toBe(false);
    expect(storedVoiceNoteConfirmationHidden('false')).toBe(false);
    expect(storedVoiceNoteConfirmationHidden('true')).toBe(true);
  });
  it('scopes the preference to the signed-in account',()=>{
    expect(voiceNoteConfirmationKey('user-a')).not.toBe(voiceNoteConfirmationKey('user-b'));
  });
});

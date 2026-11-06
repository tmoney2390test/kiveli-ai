import {describe,it,expect} from 'vitest';
import {conversationPreferences,conversationPreferenceForPlatform} from './nativeContentPolicy';
describe('iOS conversation boundaries',()=>{
  it('does not expose explicit as an iOS choice',()=>expect(conversationPreferences('ios')).toEqual(['standard','mature']));
  it('maps a saved web explicit preference to non-graphic mature on iOS',()=>{
    expect(conversationPreferenceForPlatform('explicit','ios')).toBe('mature');
    expect(conversationPreferenceForPlatform(null,'ios')).toBe('mature');
    expect(conversationPreferenceForPlatform('standard','ios')).toBe('standard');
    expect(conversationPreferenceForPlatform('explicit','web')).toBe('explicit');
  });
});

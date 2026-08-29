import { describe, expect, it } from 'vitest';
import { groupInviteParticipantIds, newGroupPrefillHref, parseGroupPrefillParticipants } from './groupInvite';

describe('group invite prefills', () => {
  it('keeps current participants and adds the invited character once', () => {
    expect(groupInviteParticipantIds(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
    expect(groupInviteParticipantIds(['a', 'c'], 'c')).toEqual(['a', 'c']);
  });

  it('always retains the invited character when the group reaches its limit', () => {
    expect(groupInviteParticipantIds(['a', 'b', 'c', 'd', 'e'], 'f')).toEqual(['a', 'b', 'c', 'd', 'f']);
  });

  it('round trips participant and world parameters', () => {
    const href = newGroupPrefillHref({ currentParticipantIds: ['one'], invitedCharacterId: 'two', worldId: 'world-id' });
    const query = href.split('?')[1] ?? '';
    const params = new URLSearchParams(query);
    expect(parseGroupPrefillParticipants(params.get('participants'))).toEqual(['one', 'two']);
    expect(params.get('world')).toBe('world-id');
  });
});

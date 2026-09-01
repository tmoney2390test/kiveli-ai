import { describe, expect, it } from 'vitest';
import { activePlanChatHref } from './planNavigation';

describe('activePlanChatHref', () => {
  it('returns the direct chat with the active plan focused', () => {
    expect(activePlanChatHref({
      planId: 'plan-1',
      characterHandle: 'iris vale',
    })).toBe('/chat?character=iris+vale&planId=plan-1');
  });

  it('returns the existing group chat for a group plan', () => {
    expect(activePlanChatHref({
      planId: 'plan-1',
      characterHandle: 'iris-vale',
      groupConversationId: 'group-1',
    })).toBe('/group-chat?id=group-1');
  });

  it('does not create a broken direct-chat link without a character', () => {
    expect(activePlanChatHref({ planId: 'plan-1', characterHandle: ' ' })).toBeNull();
  });
});

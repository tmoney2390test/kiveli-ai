import { describe, expect, it } from 'vitest';
import type { Snapshot } from '../types';
import { characterConversationHref, resolveChatRoute } from './chatRoute';

const elena = {
  id: 'elena-instance',
  character_template_id: 'elena-template',
  together_character_templates: { id: 'elena-template', slug: 'elena-petrova', public_handle: 'elena', name: 'Elena Petrova' },
};
const iris = {
  id: 'iris-instance',
  character_template_id: 'iris-template',
  together_character_templates: { id: 'iris-template', slug: 'iris-vale', name: 'Iris Vale' },
};
const elenaConversation = { id: 'elena-conversation', character_instance_id: elena.id, kind: 'direct', title: null, last_message_at: null };
const irisConversation = { id: 'iris-conversation', character_instance_id: iris.id, kind: 'direct', title: null, last_message_at: '2026-08-31T20:00:00Z' };
const snapshot = {
  profile: { active_companion_instance_id: iris.id },
  characters: [elena, iris],
  conversations: [elenaConversation, irisConversation],
  sharedPlans: [],
} as unknown as Snapshot;

describe('chat route resolution', () => {
  it('honors the explicit conversation created by a character profile handoff', () => {
    const route = resolveChatRoute(snapshot, {
      character: 'elena',
      conversationId: elenaConversation.id,
    });
    expect(route.character?.id).toBe(elena.id);
    expect(route.conversation?.id).toBe(elenaConversation.id);
  });

  it('does not fall back to the most recent or active companion when a conversation is explicit', () => {
    const route = resolveChatRoute(snapshot, { conversationId: elenaConversation.id });
    expect(route.character?.id).toBe(elena.id);
    expect(route.conversation?.id).toBe(elenaConversation.id);
  });

  it('builds an encoded, stable profile-to-chat destination', () => {
    expect(characterConversationHref('elena petrova', 'conversation/id')).toBe(
      '/chat?character=elena%20petrova&conversationId=conversation%2Fid',
    );
  });
});

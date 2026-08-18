import { describe, expect, it } from 'vitest';
import type { CharacterInstance, Conversation } from '../types';
import { buildInboxRows, chatHrefFromInboxParams, formatInboxTimestamp, inboxPreview } from './messageInbox';

const character = (id: string, templateId: string, name: string): CharacterInstance => ({
  id,
  user_id: 'user',
  character_template_id: templateId,
  character_version_id: `${templateId}-version`,
  relationship_stage: 'acquaintance',
  current_mood: 'calm',
  current_activity: 'relaxing',
  current_location_id: 'home',
  current_energy: 'medium',
  introduced_at: '2026-08-01T12:00:00.000Z',
  contact_added_at: '2026-08-01T12:00:00.000Z',
  met_at: '2026-08-01T12:00:00.000Z',
  last_simulated_at: '2026-08-18T12:00:00.000Z',
  together_character_templates: { id: templateId, name, slug: name.toLocaleLowerCase(), age: 27, occupation: 'Designer', biography: '' },
  together_character_versions: { id: `${templateId}-version`, portrait_asset_key: name.toLocaleLowerCase(), interests: [], personality_config: {} },
});

const conversation = (id: string, characterId: string, lastMessageAt: string | null, preview: string, archivedAt: string | null = null): Conversation => ({
  id,
  character_instance_id: characterId,
  kind: 'direct',
  title: null,
  last_message_at: lastMessageAt,
  archived_at: archivedAt,
  last_message_preview: preview,
});

describe('message inbox presentation', () => {
  const characters = [character('maya', 'maya-template', 'Maya'), character('chloe', 'chloe-template', 'Chloe')];
  const conversations = [
    conversation('maya-chat', 'maya', '2026-08-18T12:00:00.000Z', 'Want to go for a walk?'),
    conversation('chloe-chat', 'chloe', '2026-08-18T13:00:00.000Z', 'I found that place.'),
    conversation('old-chat', 'maya', '2026-08-17T12:00:00.000Z', 'Old news', '2026-08-17T13:00:00.000Z'),
  ];

  it('shows active chats newest-first and excludes archived transcripts', () => {
    expect(buildInboxRows(conversations, characters, [], '', 'all').map((row) => row.conversation.id)).toEqual(['chloe-chat', 'maya-chat']);
  });

  it('filters favorites and searches names or previews', () => {
    expect(buildInboxRows(conversations, characters, ['maya-template'], '', 'favorites').map((row) => row.character.id)).toEqual(['maya']);
    expect(buildInboxRows(conversations, characters, [], 'found', 'all').map((row) => row.character.id)).toEqual(['chloe']);
    expect(buildInboxRows(conversations, characters, [], 'MAYA', 'all').map((row) => row.character.id)).toEqual(['maya']);
  });

  it('formats compact timestamps and safe empty previews', () => {
    expect(formatInboxTimestamp('2026-08-16T12:00:00.000Z', new Date('2026-08-18T14:00:00.000Z'))).toBe('2d');
    expect(formatInboxTimestamp(null)).toBe('');
    expect(inboxPreview(conversation('empty', 'maya', null, '   '))).toBe('Start the conversation.');
  });

  it('forwards existing chat intents while leaving a plain tab visit in the inbox', () => {
    expect(chatHrefFromInboxParams({})).toBeNull();
    expect(chatHrefFromInboxParams({ character: 'maya', plan: '1', draft: 'Meet me at Juniper Café?' }))
      .toBe('/chat?character=maya&plan=1&draft=Meet%20me%20at%20Juniper%20Caf%C3%A9%3F');
  });
});

import { describe, expect, it } from 'vitest';
import type { Snapshot } from '../types';
import { browserPageTitle } from './browserPageTitle';

const freya = { id: 'freya-instance', character_template_id: 'freya-template', together_character_templates: { name: 'Freya', slug: 'freya-valen', public_handle: 'freya' } };
const iris = { id: 'iris-instance', character_template_id: 'iris-template', together_character_templates: { name: 'Iris Vale', slug: 'iris-vale' } };
const snapshot = {
  profile: { active_companion_instance_id: iris.id }, characters: [freya, iris],
  conversations: [
    { id: 'freya-chat', character_instance_id: freya.id, kind: 'direct', last_message_at: '2026-09-10T12:00:00Z' },
    { id: 'iris-chat', character_instance_id: iris.id, kind: 'direct', last_message_at: '2026-09-10T13:00:00Z' },
  ],
  sharedPlans: [{ id: 'freya-plan', character_instance_id: freya.id }],
} as unknown as Snapshot;

describe('browser page titles', () => {
  it.each([
    ['/home', 'Home | Kivelli'], ['/(tabs)/home/', 'Home | Kivelli'],
    ['/explore', 'Explore | Kivelli'], ['/subscription', 'Membership | Kivelli'],
    ['/privacy-policy', 'Privacy Policy | Kivelli'], ['/create/companion/draft-id', 'Create a Companion | Kivelli'],
    ['/location/hidden-cove', 'Location | Kivelli'], ['/unknown-route', 'Kivelli'],
  ])('labels %s', (path, title) => expect(browserPageTitle(path)).toBe(title));

  it('uses the visible character, including conversation and plan handoffs', () => {
    for (const character of ['freya', 'freya-valen', 'freya-instance', 'freya-template']) {
      expect(browserPageTitle('/chat', { character }, snapshot)).toBe('Chat | Freya');
    }
    expect(browserPageTitle('/chat', { character: 'iris-vale', conversationId: 'freya-chat' }, snapshot)).toBe('Chat | Freya');
    expect(browserPageTitle('/chat', { conversationId: 'iris-chat', planId: 'freya-plan' }, snapshot)).toBe('Chat | Freya');
    expect(browserPageTitle('/chat', {}, snapshot)).toBe('Chat | Iris Vale');
  });

  it('keeps chat names out of the inbox and group chat', () => {
    expect(browserPageTitle('/chat-tab', {}, snapshot)).toBe('Messages | Kivelli');
    expect(browserPageTitle('/chat-tab', { inbox: '1', character: 'freya' }, snapshot)).toBe('Messages | Kivelli');
    expect(browserPageTitle('/chat-tab', { character: 'freya' }, snapshot)).toBe('Chat | Freya');
    expect(browserPageTitle('/chat', { group: '1', id: 'group-id' }, snapshot)).toBe('Group Chat | Kivelli');
  });

  it('waits for known character data instead of exposing URL text', () => {
    expect(browserPageTitle('/chat', { character: 'private-id', draft: 'private draft' })).toBe('Chat | Kivelli');
    expect(browserPageTitle('/home', { character: 'freya' }, snapshot)).toBe('Home | Kivelli');
  });

  it('updates query-only settings sections and accepts array parameters', () => {
    expect(browserPageTitle('/settings', { section: 'relationships' })).toBe('Relationships | Kivelli');
    expect(browserPageTitle('/profile', { section: ['identity'] })).toBe('Personas & Lives | Kivelli');
    expect(browserPageTitle('/settings', { section: 'unknown' })).toBe('Settings | Kivelli');
    expect(browserPageTitle('/chat', { character: ['freya'] }, snapshot)).toBe('Chat | Freya');
  });
});

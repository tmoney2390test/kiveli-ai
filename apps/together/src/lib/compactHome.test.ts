import { describe, expect, it } from 'vitest';
import type { Snapshot } from '../types';
import type { HomeViewModel } from './homeViewModel';
import { homeChatHref, homeNextItem, homeSharedItems } from './compactHome';

const companion = { id: 'companion', together_character_templates: { name: 'Companion' } };
const model = { companion, recentMoments: [], upcoming: { eyebrow: 'UPCOMING', title: 'Dinner', meta: 'Fri · 7:00 PM', action: { kind: 'plan', id: 'plan', label: 'View plan' } } } as unknown as HomeViewModel;
const snapshot = { characters: [companion], conversations: [{ id: 'recent-chat', kind: 'direct', character_instance_id: 'companion', last_message_at: '2026-09-09T21:00:00Z' }], generatedMedia: [], moments: [], dates: [], lifeEvents: [], locations: [] } as unknown as Snapshot;

describe('compact Home actions and shared content', () => {
  it('continues the saved conversation and opens planning in the same chat', () => {
    expect(homeChatHref(snapshot, model)).toBe('/chat?character=companion&conversationId=recent-chat');
    expect(homeChatHref(snapshot, model, true)).toBe('/chat?character=companion&conversationId=recent-chat&plan=1');
  });
  it('gives the active scenario priority and keeps planning in its original conversation', () => {
    const active = { ...model, companion: { ...model.companion, scenario_state: { conversationId: 'scenario-chat', title: 'The Invitation' } } } as HomeViewModel;
    expect(homeChatHref(snapshot, active, true)).toBe('/chat?character=companion&conversationId=scenario-chat&plan=1');
    expect(homeNextItem(active)).toMatchObject({ kind: 'scenario', title: 'The Invitation', label: 'Continue scenario' });
  });
  it('shows scheduled plans but does not present unlocked date suggestions as appointments', () => {
    expect(homeNextItem(model)).toMatchObject({ kind: 'scheduled', title: 'Dinner', label: 'View plan' });
    expect(homeNextItem({ ...model, upcoming: { ...model.upcoming, eyebrow: 'DATE IDEA' } })).toMatchObject({ kind: 'planning', label: 'Plan an event' });
  });
  it('hides empty sharing and excludes unfinished and other-companion media', () => {
    expect(homeSharedItems(snapshot, model)).toEqual([]);
    const media = [{ id: 'pending', character_instance_id: 'companion', status: 'pending' }, { id: 'other', character_instance_id: 'other', status: 'ready', signed_url: 'https://example.com/image.jpg', media_type: 'image' }];
    expect(homeSharedItems({ ...snapshot, generatedMedia: media } as Snapshot, model)).toEqual([]);
  });
  it('merges photos and moments newest first without repeating an illustrated moment', () => {
    const moments = [{ id: 'illustrated', title: 'One moment', occurred_at: '2026-09-09T17:00:00Z' }, { id: 'newest', title: 'Another moment', occurred_at: '2026-09-09T19:00:00Z' }];
    const media = [{ id: 'photo', character_instance_id: 'companion', moment_id: 'illustrated', status: 'ready', signed_url: 'https://example.com/photo.jpg', media_type: 'image', created_at: '2026-09-09T18:00:00Z', metadata: { locked: true } }];
    const result = homeSharedItems({ ...snapshot, moments, generatedMedia: media } as unknown as Snapshot, { ...model, recentMoments: moments } as HomeViewModel);
    expect(result.map(entry => `${entry.kind}:${entry.item.id}`)).toEqual(['moment:newest', 'media:photo']);
    expect(result[1]?.item).toMatchObject({ locked: true });
  });
});

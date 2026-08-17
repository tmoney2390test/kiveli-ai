import { describe, expect, it } from 'vitest';
import type { Snapshot } from '../types';
import { buildHomeViewModel } from './homeViewModel';

const now = new Date('2026-08-16T11:30:00.000Z');

const snapshot = {
  profile: { active_companion_instance_id: 'chloe-instance', experience_timezone: 'America/New_York' },
  activeContinuity: null,
  characters: [{
    id: 'chloe-instance',
    user_id: 'user',
    character_template_id: 'chloe-template',
    character_version_id: 'chloe-version',
    relationship_stage: 'stranger',
    current_mood: 'resting',
    current_activity: 'offline for the night',
    current_location_id: 'chloe-home',
    current_energy: 'low',
    contact_added_at: '2026-08-15T12:00:00.000Z',
    introduced_at: '2026-08-15T12:00:00.000Z',
    met_at: '2026-08-15T12:00:00.000Z',
    last_simulated_at: '2026-08-16T11:00:00.000Z',
    together_character_templates: { id: 'chloe-template', name: 'Chloe', slug: 'chloe', age: 27, occupation: 'Designer', biography: 'Designer' },
    together_character_versions: { id: 'chloe-version', interests: [], personality_config: {}, portrait_asset_key: 'chloe-portrait' },
  }],
  relationships: [{ character_instance_id: 'chloe-instance', days_known: 4 }],
  conversations: [{ id: 'chloe-chat', character_instance_id: 'chloe-instance', kind: 'direct', title: 'Chat', last_message_at: '2026-08-16T11:20:00.000Z', last_assistant_message_at: '2026-08-16T11:20:00.000Z', last_read_at: '2026-08-16T11:00:00.000Z', archived_at: null, unread: true }],
  memories: [
    { id: 'older-important', character_instance_id: 'chloe-instance', memory_type: 'semantic', canonical_text: 'You like old movies.', importance: 0.9, confidence: 0.9, pinned: false, status: 'active', created_at: '2026-08-14T12:00:00.000Z', updated_at: '2026-08-14T12:00:00.000Z' },
    { id: 'pinned', character_instance_id: 'chloe-instance', memory_type: 'preference', canonical_text: 'Your favorite season is fall.', importance: 0.6, confidence: 0.9, pinned: true, status: 'active', created_at: '2026-08-15T12:00:00.000Z', updated_at: '2026-08-15T12:00:00.000Z' },
  ],
  moments: [],
  sharedPlans: [],
  dates: [],
  storyArcs: [],
  generatedMedia: [],
  openThreads: [],
  relationshipMilestones: [],
  relationshipCues: {},
  proactiveMessages: [
    { id: 'opened-newer', character_instance_id: 'chloe-instance', content: 'Already read.', status: 'opened', eligible_at: '2026-08-16T11:25:00.000Z', conversation_id: 'chloe-chat', sent_message_id: 'opened-message' },
    { id: 'sent-older', character_instance_id: 'chloe-instance', content: 'I have something to tell you.', status: 'sent', eligible_at: '2026-08-16T11:20:00.000Z', conversation_id: 'chloe-chat', sent_message_id: 'sent-message' },
  ],
  lifeEvents: [{ id: 'morning', character_instance_id: 'chloe-instance', title: 'Slow morning', narrative_summary: 'Chloe slept a little later than planned.', starts_at: '2026-08-16T10:45:00.000Z', user_should_know: true }],
  worlds: [{ id: 'city', slug: 'city-life', name: 'City Life', description: 'City', access_type: 'free', timezone: 'America/New_York', sort_order: 0, featured: true, published: true, visual_context: {}, metadata: {} }],
  locations: [
    { id: 'chloe-home', world_id: 'city', name: "Chloe's Loft", slug: 'chloe-loft', location_type: 'residence', description: 'Home', category: 'home', possible_activities: ['rest'], sort_order: 0, metadata: {} },
    { id: 'rooftop', world_id: 'city', name: 'Skyline Rooftop', slug: 'skyline-rooftop', location_type: 'venue', description: 'Rooftop', category: 'entertainment', possible_activities: ['friends'], sort_order: 1, metadata: {} },
  ],
  schedules: [
    { id: 'night', character_version_id: 'chloe-version', day_of_week: 0, start_minute: 0, end_minute: 510, location_id: 'chloe-home', activity: 'offline for the night', availability: 'busy', energy_delta: -1 },
    { id: 'later', character_version_id: 'chloe-version', day_of_week: 0, start_minute: 540, end_minute: 720, location_id: 'rooftop', activity: 'meeting friends on the rooftop', availability: 'available', energy_delta: 0 },
  ],
  characterWorldPresence: [{ id: 'presence', character_version_id: 'chloe-version', world_id: 'city', presence_type: 'resident', home_location_id: 'chloe-home', familiarity: 1, visited_count: 1, metadata: {} }],
} as unknown as Snapshot;

describe('buildHomeViewModel', () => {
  it('turns canonical state into a compact living Home surface', () => {
    const model = buildHomeViewModel(snapshot, now);
    expect(model?.relationshipDay).toBe(4);
    expect(model?.hero.statusLine).toBe('At home · Winding down');
    expect(model?.hero.stage).toBe('Just met');
    expect(model?.message?.id).toBe('sent-older');
    expect(model?.hero.action).toEqual({ kind: 'chat', label: 'Reply to Chloe', proactiveMessageId: 'sent-older' });
    expect(model?.memory.title).toBe('Your favorite season is fall.');
    expect(model?.timeline.map((item) => item.kind)).toEqual(['event', 'now', 'schedule']);
    expect(model?.timeline[0]?.time).toBe('6:45 AM');
    expect(model?.timeline[1]?.time).toBe('Now');
    expect(model?.timeline[2]?.time).toBe('9:00 AM');
  });

  it('uses a contextual companion CTA when there is no unread message', () => {
    const model = buildHomeViewModel({ ...snapshot, proactiveMessages: [] }, now);
    expect(model?.hero.action).toEqual({ kind: 'chat', label: 'Keep Chloe company' });
  });

  it('does not show a proactive message when the active chat is empty', () => {
    const model = buildHomeViewModel({ ...snapshot, conversations: [], proactiveMessages: snapshot.proactiveMessages }, now);
    expect(model?.message).toBeUndefined();
    expect(model?.hero.notice).not.toBe('New message from Chloe');
  });

  it('does not call a cafe home just because legacy presence data points there', () => {
    const cafeSnapshot = {
      ...snapshot,
      characters: snapshot.characters.map((character) => ({ ...character, current_location_id: 'rooftop' })),
      characterWorldPresence: [{ ...snapshot.characterWorldPresence![0]!, home_location_id: 'rooftop' }],
      proactiveMessages: [],
    } as unknown as Snapshot;
    const model = buildHomeViewModel(cafeSnapshot, now);
    expect(model?.hero.statusLine.startsWith('At home')).toBe(false);
    expect(model?.hero.statusLine).toContain('Skyline Rooftop');
  });

  it('does not call a cafe home just because legacy presence data points there', () => {
    const cafeSnapshot = {
      ...snapshot,
      characters: snapshot.characters.map((character) => ({ ...character, current_location_id: 'rooftop' })),
      characterWorldPresence: [{ ...snapshot.characterWorldPresence![0]!, home_location_id: 'rooftop' }],
      proactiveMessages: [],
    } as unknown as Snapshot;
    const model = buildHomeViewModel(cafeSnapshot, now);
    expect(model?.hero.statusLine.startsWith('At home')).toBe(false);
    expect(model?.hero.statusLine).toContain('Skyline Rooftop');
  });
});


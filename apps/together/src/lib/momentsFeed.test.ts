import { describe, expect, it } from 'vitest';
import type { GeneratedMedia, Moment, Snapshot } from '../types';
import { buildMomentsFeed } from './momentsFeed';

const moment: Moment = {
  id: 'moment-1',
  character_instance_id: 'maya',
  title: 'A real Moment',
  summary: 'A shared memory.',
  occurred_at: '2026-08-17T14:00:00.000Z',
  participant_instance_ids: ['maya'],
  linked_memory_ids: [],
  moment_type: 'conversation',
  media: [],
};

const unlinkedPhoto: GeneratedMedia = {
  id: 'photo-1',
  character_instance_id: 'maya',
  media_type: 'image',
  content_level: 'standard',
  status: 'ready',
  signed_url: 'https://example.test/photo.jpg',
  created_at: '2026-08-18T14:00:00.000Z',
};

const snapshot = {
  moments: [moment],
  generatedMedia: [unlinkedPhoto],
  characters: [{ id: 'maya', together_character_templates: { name: 'Maya' } }],
  locations: [],
  worlds: [],
  lifeEvents: [],
  dates: [],
} as unknown as Snapshot;

describe('Moments feed', () => {
  it('shows ready chat photos even when no Moment row exists', () => {
    expect(buildMomentsFeed(snapshot, 'maya', 'Photos').map((item) => item.id)).toEqual(['photo-1']);
    expect(buildMomentsFeed(snapshot, 'maya', 'All').map((item) => item.id)).toEqual(['photo-1', 'moment-1']);
  });

  it('deduplicates a photo that is already attached to a Moment', () => {
    const linked = { ...unlinkedPhoto, moment_id: moment.id };
    const feed = buildMomentsFeed({ ...snapshot, generatedMedia: [linked] }, 'maya', 'Photos');
    expect(feed).toHaveLength(1);
    expect(feed[0]?.kind).toBe('moment');
    expect(feed[0]?.kind === 'moment' ? feed[0].mediaUrl : null).toBe(linked.signed_url);
  });

  it('does not leak another companion’s photos into a scoped feed', () => {
    const other = { ...unlinkedPhoto, id: 'photo-2', character_instance_id: 'chloe' };
    expect(buildMomentsFeed({ ...snapshot, generatedMedia: [unlinkedPhoto, other] }, 'maya', 'Photos').map((item) => item.id)).toEqual(['photo-1']);
  });
});

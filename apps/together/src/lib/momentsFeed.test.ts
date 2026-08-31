import { describe, expect, it } from 'vitest';
import type { GeneratedMedia, Moment, Snapshot } from '../types';
import { buildMomentsFeed, videoMomentFrameUrl } from './momentsFeed';

const moment: Moment = {
  id: 'moment-1', character_instance_id: 'maya', title: 'A real Moment', summary: 'A shared memory.',
  occurred_at: '2026-08-17T14:00:00.000Z', participant_instance_ids: ['maya'], linked_memory_ids: [], moment_type: 'conversation', media: [],
};

const unlinkedPhoto: GeneratedMedia = {
  id: 'photo-1', character_instance_id: 'maya', media_type: 'image', content_level: 'standard', status: 'ready',
  signed_url: 'https://example.test/photo.jpg', created_at: '2026-08-18T14:00:00.000Z',
};

const snapshot = {
  moments: [moment], generatedMedia: [unlinkedPhoto],
  characters: [{ id: 'maya', together_character_templates: { name: 'Maya' } }, { id: 'chloe', together_character_templates: { name: 'Chloe' } }],
  locations: [], worlds: [], lifeEvents: [], dates: [], sharedPlans: [], memories: [], relationshipMilestoneHistory: [],
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

  it('projects a completed plan into All and Experiences without requiring a Moment row', () => {
    const sharedPlans = [{ id:'plan-1', character_instance_id:'maya', title:'Books at Paper Trail', activity_key:'books', location_id:null, starts_at:'2026-08-18T12:00:00Z', ends_at:'2026-08-18T13:00:00Z', completed_at:'2026-08-18T13:00:00Z', status:'completed', source:'chat', created_at:'2026-08-18T11:00:00Z', updated_at:'2026-08-18T13:00:00Z' }] as Snapshot['sharedPlans'];
    const value = { ...snapshot, sharedPlans };
    expect(buildMomentsFeed(value, 'maya', 'Experiences').map((item) => item.kind)).toEqual(['plan']);
    expect(buildMomentsFeed(value, 'maya', 'All').map((item) => item.id)).toContain('plan-1');
  });

  it('uses resolved relationship records for Milestones and excludes deferred choices', () => {
    const relationshipMilestoneHistory = [
      { id:'milestone-1', character_instance_id:'maya', kind:'romantic_spark', from_stage:'friend', to_stage:'flirting', status:'accepted', title:'There is a spark', body:'Something changed.', prompt:'', choices:[], created_at:'2026-08-16T12:00:00Z', resolved_at:'2026-08-16T13:00:00Z' },
      { id:'milestone-2', character_instance_id:'maya', kind:'long_term', from_stage:'exclusive', to_stage:'long_term', status:'deferred', title:'Not yet', body:'Later.', prompt:'', choices:[], created_at:'2026-08-17T12:00:00Z', resolved_at:'2026-08-17T13:00:00Z' },
    ] as Snapshot['relationshipMilestoneHistory'];
    expect(buildMomentsFeed({ ...snapshot, relationshipMilestoneHistory }, 'maya', 'Milestones').map((item) => item.id)).toEqual(['milestone-1']);
  });

  it('shows episodic completed-plan memories in Memories', () => {
    const memories = [{ id:'memory-1', character_instance_id:'maya', memory_type:'episodic', canonical_text:'You and Maya browsed Paper Trail.', importance:.6, confidence:.98, pinned:false, status:'active', created_at:'2026-08-18T13:00:00Z', updated_at:'2026-08-18T13:00:00Z' }] as Snapshot['memories'];
    expect(buildMomentsFeed({ ...snapshot, memories }, 'maya', 'Memories').map((item) => item.id)).toEqual(['memory-1']);
  });

  it('does not leak another companion’s history into a scoped feed', () => {
    const other = { ...unlinkedPhoto, id: 'photo-2', character_instance_id: 'chloe' };
    expect(buildMomentsFeed({ ...snapshot, generatedMedia: [unlinkedPhoto, other] }, 'maya', 'Photos').map((item) => item.id)).toEqual(['photo-1']);
  });

  it('keeps queued and completed videos discoverable with their source photo as a poster', () => {
    const video: GeneratedMedia = { id:'video-1',character_instance_id:'maya',parent_media_id:'photo-1',media_type:'video',content_level:'standard',status:'generating',created_at:'2026-08-18T15:00:00.000Z' };
    const feed=buildMomentsFeed({...snapshot,generatedMedia:[unlinkedPhoto,video]},'maya','Videos');
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({kind:'video',id:'video-1',poster:{id:'photo-1'}});
    expect(videoMomentFrameUrl(feed[0]!)).toBeUndefined();
    const readyFeed=buildMomentsFeed({...snapshot,generatedMedia:[unlinkedPhoto,{...video,status:'ready',signed_url:'https://example.test/video.mp4'}]},'maya','Videos');
    expect(videoMomentFrameUrl(readyFeed[0]!)).toBe('https://example.test/video.mp4');
  });
});

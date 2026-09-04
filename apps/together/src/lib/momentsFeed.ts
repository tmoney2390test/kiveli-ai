import type { DateSession, GeneratedMedia, Memory, Moment, RelationshipMilestone, SharedPlan, Snapshot } from '../types';
import { naturalizeCharacterEventTitle } from '@together/domain/src/character-language';

export type MomentsFeedFilter = 'All' | 'Experiences' | 'Milestones' | 'Memories' | 'Photos' | 'Videos';

export type MomentsFeedEntry =
  | { kind: 'moment'; id: string; occurred_at: string; moment: Moment; mediaUrl?: string | null }
  | { kind: 'plan'; id: string; occurred_at: string; plan: SharedPlan }
  | { kind: 'date'; id: string; occurred_at: string; date: DateSession }
  | { kind: 'milestone'; id: string; occurred_at: string; milestone: RelationshipMilestone }
  | { kind: 'memory'; id: string; occurred_at: string; memory: Memory }
  | { kind: 'photo'; id: string; occurred_at: string; media: GeneratedMedia; title: string }
  | { kind: 'video'; id: string; occurred_at: string; media: GeneratedMedia; poster?: GeneratedMedia; title: string };

export function buildMomentsFeed(snapshot: Snapshot, companionId: string, filter: MomentsFeedFilter, query = ''): MomentsFeedEntry[] {
  const scoped = (characterInstanceId: string) => companionId === 'all' || characterInstanceId === companionId;
  const moments = snapshot.moments.filter((moment) => scoped(moment.character_instance_id) || (moment.participant_instance_ids ?? []).includes(companionId));
  const plans = (snapshot.sharedPlans ?? []).filter((plan) => scoped(plan.character_instance_id) && plan.status === 'completed' && plan.source !== 'date');
  const dates = snapshot.dates.filter((date) => scoped(date.character_instance_id) && date.status === 'completed' && Boolean(date.completed_at));
  const milestones = (snapshot.relationshipMilestoneHistory ?? []).filter((milestone) => scoped(milestone.character_instance_id) && milestone.status !== 'deferred');
  const memories = snapshot.memories.filter((memory) => scoped(memory.character_instance_id) && ['episodic', 'relationship'].includes(memory.memory_type));
  const allPhotos = (snapshot.generatedMedia ?? []).filter((item) => item.media_type === 'image' && item.status === 'ready' && scoped(item.character_instance_id));
  const photos = allPhotos.filter((item)=>item.metadata?.hiddenIntermediate!==true);
  const videos = (snapshot.generatedMedia ?? []).filter((item) => item.media_type === 'video' && ['queued', 'generating', 'ready'].includes(item.status) && scoped(item.character_instance_id));
  const normalizedQuery = query.trim().toLowerCase();

  const representedPlanIds = new Set(plans.map((plan) => plan.id));
  const representedDateIds = new Set(dates.map((date) => date.id));
  const visibleMoments = moments.filter((moment) => {
    if (filter === 'Photos') return momentHasPhoto(moment, photos);
    if (filter === 'Milestones') return /milestone|relationship|introduction/i.test(moment.moment_type);
    if (filter !== 'All') return false;
    return !(moment.shared_plan_id && representedPlanIds.has(moment.shared_plan_id)) && !(moment.date_session_id && representedDateIds.has(moment.date_session_id));
  });

  const entries: MomentsFeedEntry[] = [];
  if (filter === 'All' || filter === 'Photos' || filter === 'Milestones') {
    entries.push(...visibleMoments.map((moment) => ({
      kind: 'moment' as const,
      id: moment.id,
      occurred_at: moment.occurred_at,
      moment,
      mediaUrl: photos.find((item) => item.moment_id === moment.id && item.signed_url)?.signed_url,
    })));
  }
  if (filter === 'All' || filter === 'Experiences') {
    entries.push(...plans.map((plan) => ({ kind: 'plan' as const, id: plan.id, occurred_at: plan.completed_at ?? plan.ends_at, plan })));
    entries.push(...dates.map((date) => ({ kind: 'date' as const, id: date.id, occurred_at: date.completed_at!, date })));
  }
  if (filter === 'All' || filter === 'Milestones') {
    entries.push(...milestones.map((milestone) => ({ kind: 'milestone' as const, id: milestone.id, occurred_at: milestone.resolved_at ?? milestone.updated_at ?? milestone.created_at, milestone })));
  }
  if (filter === 'Memories') {
    entries.push(...memories.map((memory) => ({ kind: 'memory' as const, id: memory.id, occurred_at: memory.updated_at ?? memory.created_at, memory })));
  }
  if (filter === 'All' || filter === 'Photos') {
    const representedMomentIds = new Set(moments.map((moment) => moment.id));
    entries.push(...photos
      .filter((media) => !media.moment_id || !representedMomentIds.has(media.moment_id))
      .map((media) => ({ kind: 'photo' as const, id: media.id, occurred_at: media.created_at, media, title: generatedPhotoTitle(snapshot, media) })));
  }
  if (filter === 'All' || filter === 'Videos') {
    entries.push(...videos.map((media) => ({
      kind: 'video' as const,
      id: media.id,
      occurred_at: media.created_at,
      media,
      poster: allPhotos.find((photo) => photo.id === media.parent_media_id),
      title: generatedVideoTitle(snapshot, media),
    })));
  }

  return entries
    .filter((entry) => entryMatchesQuery(snapshot, entry, normalizedQuery))
    .sort((left, right) => new Date(right.occurred_at).getTime() - new Date(left.occurred_at).getTime());
}

export function generatedVideoTitle(snapshot: Snapshot, media: GeneratedMedia): string {
  const character = snapshot.characters.find((item) => item.id === media.character_instance_id);
  if (media.status === 'ready') return character ? `A living moment with ${character.together_character_templates.name}` : 'A living moment';
  return character ? `Creating a video with ${character.together_character_templates.name}` : 'Creating your video';
}

export function videoMomentFrameUrl(entry:MomentsFeedEntry):string|undefined{
  return entry.kind==='video'&&entry.media.status==='ready'?entry.media.signed_url??undefined:undefined;
}

export function generatedPhotoTitle(snapshot: Snapshot, media: GeneratedMedia): string {
  const metadata = media.metadata ?? {};
  const authoredTitle = typeof metadata.title === 'string' ? metadata.title.trim() : '';
  if (authoredTitle) return authoredTitle;
  const event = media.life_event_id ? snapshot.lifeEvents.find((item) => item.id === media.life_event_id) : undefined;
  if (event?.title) return naturalizeCharacterEventTitle(event.title,event.event_type);
  const date = media.date_session_id ? snapshot.dates.find((item) => item.id === media.date_session_id) : undefined;
  if (date?.together_date_templates.name) return date.together_date_templates.name;
  const location = media.location_id ? snapshot.locations.find((item) => item.id === media.location_id) : undefined;
  if (location) return `Photo from ${location.name}`;
  const character = snapshot.characters.find((item) => item.id === media.character_instance_id);
  return character ? `From ${character.together_character_templates.name}` : 'A photo from your story';
}

function momentHasPhoto(moment: Moment, photos: GeneratedMedia[]): boolean {
  return (moment.media ?? []).length > 0 || photos.some((item) => item.moment_id === moment.id);
}

function entryMatchesQuery(snapshot: Snapshot, entry: MomentsFeedEntry, query: string): boolean {
  if (!query) return true;
  const characterInstanceId = entry.kind === 'moment' ? entry.moment.character_instance_id
    : entry.kind === 'photo' || entry.kind === 'video' ? entry.media.character_instance_id
      : entry.kind === 'plan' ? entry.plan.character_instance_id
        : entry.kind === 'date' ? entry.date.character_instance_id
          : entry.kind === 'milestone' ? entry.milestone.character_instance_id
            : entry.memory.character_instance_id;
  const locationId = entry.kind === 'moment' ? entry.moment.location_id
    : entry.kind === 'photo' || entry.kind === 'video' ? entry.media.location_id
      : entry.kind === 'plan' ? entry.plan.location_id
        : entry.kind === 'date' ? entry.date.together_date_templates.location_id
          : entry.kind === 'memory' ? entry.memory.location_id
            : null;
  const place = locationId ? snapshot.locations.find((item) => item.id === locationId) : undefined;
  const world = place ? snapshot.worlds.find((item) => item.id === place.world_id) : undefined;
  const person = snapshot.characters.find((item) => item.id === characterInstanceId);
  const text = entry.kind === 'moment' ? `${entry.moment.title} ${entry.moment.summary}`
    : entry.kind === 'photo' || entry.kind === 'video' ? entry.title
      : entry.kind === 'plan' ? `${entry.plan.title} ${planSummary(entry.plan)}`
        : entry.kind === 'date' ? `${entry.date.together_date_templates.name} ${entry.date.together_date_templates.description}`
          : entry.kind === 'milestone' ? `${entry.milestone.title} ${entry.milestone.body}`
            : entry.memory.canonical_text;
  return `${text} ${place?.name ?? ''} ${world?.name ?? ''} ${person?.together_character_templates.name ?? ''}`.toLowerCase().includes(query);
}

export function planSummary(plan: SharedPlan): string {
  const experience = plan.metadata?.planExperience;
  return typeof experience === 'object' && experience && typeof (experience as Record<string, unknown>).summary === 'string'
    ? String((experience as Record<string, unknown>).summary)
    : plan.note ?? `${plan.title} became part of your shared history.`;
}

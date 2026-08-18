import type { GeneratedMedia, Moment, Snapshot } from '../types';

export type MomentsFeedFilter = 'All' | 'Milestones' | 'Dates' | 'Memories' | 'Photos';

export type MomentsFeedEntry =
  | { kind: 'moment'; id: string; occurred_at: string; moment: Moment; mediaUrl?: string | null }
  | { kind: 'photo'; id: string; occurred_at: string; media: GeneratedMedia; title: string };

export function buildMomentsFeed(snapshot: Snapshot, companionId: string, filter: MomentsFeedFilter, query = ''): MomentsFeedEntry[] {
  const moments = companionId === 'all'
    ? snapshot.moments
    : snapshot.moments.filter((moment) => moment.character_instance_id === companionId || (moment.participant_instance_ids ?? []).includes(companionId));
  const photos = (snapshot.generatedMedia ?? []).filter((item) =>
    item.media_type === 'image' &&
    item.status === 'ready' &&
    (companionId === 'all' || item.character_instance_id === companionId)
  );
  const momentIds = new Set(moments.map((moment) => moment.id));
  const normalizedQuery = query.trim().toLowerCase();

  const momentEntries = moments
    .filter((moment) => momentMatchesFilter(moment, photos, filter))
    .filter((moment) => matchesMomentQuery(snapshot, moment, normalizedQuery))
    .map<MomentsFeedEntry>((moment) => ({
      kind: 'moment',
      id: moment.id,
      occurred_at: moment.occurred_at,
      moment,
      mediaUrl: photos.find((item) => item.moment_id === moment.id && item.signed_url)?.signed_url,
    }));

  const photoEntries = filter === 'All' || filter === 'Photos'
    ? photos
      .filter((media) => !media.moment_id || !momentIds.has(media.moment_id))
      .map<MomentsFeedEntry>((media) => ({
        kind: 'photo',
        id: media.id,
        occurred_at: media.created_at,
        media,
        title: generatedPhotoTitle(snapshot, media),
      }))
      .filter((entry) => entry.kind === 'photo' && matchesPhotoQuery(snapshot, entry.media, entry.title, normalizedQuery))
    : [];

  return [...momentEntries, ...photoEntries].sort((left, right) => new Date(right.occurred_at).getTime() - new Date(left.occurred_at).getTime());
}

export function generatedPhotoTitle(snapshot: Snapshot, media: GeneratedMedia): string {
  const metadata = media.metadata ?? {};
  const authoredTitle = typeof metadata.title === 'string' ? metadata.title.trim() : '';
  if (authoredTitle) return authoredTitle;
  const event = media.life_event_id ? snapshot.lifeEvents.find((item) => item.id === media.life_event_id) : undefined;
  if (event?.title) return event.title;
  const date = media.date_session_id ? snapshot.dates.find((item) => item.id === media.date_session_id) : undefined;
  if (date?.together_date_templates.name) return date.together_date_templates.name;
  const location = media.location_id ? snapshot.locations.find((item) => item.id === media.location_id) : undefined;
  if (location) return `Photo from ${location.name}`;
  const character = snapshot.characters.find((item) => item.id === media.character_instance_id);
  return character ? `From ${character.together_character_templates.name}` : 'A photo from your story';
}

function momentMatchesFilter(moment: Moment, photos: GeneratedMedia[], filter: MomentsFeedFilter): boolean {
  if (filter === 'All') return true;
  if (filter === 'Photos') return (moment.media ?? []).length > 0 || photos.some((item) => item.moment_id === moment.id);
  if (filter === 'Dates') return /date/i.test(moment.moment_type);
  if (filter === 'Milestones') return /milestone|relationship|introduction/i.test(moment.moment_type);
  return /memory|conversation/i.test(moment.moment_type);
}

function matchesMomentQuery(snapshot: Snapshot, moment: Moment, query: string): boolean {
  if (!query) return true;
  const place = snapshot.locations.find((item) => item.id === moment.location_id);
  const world = place ? snapshot.worlds.find((item) => item.id === place.world_id) : undefined;
  const person = snapshot.characters.find((item) => item.id === moment.character_instance_id || (moment.participant_instance_ids ?? []).includes(item.id));
  return `${moment.title} ${moment.summary} ${place?.name ?? ''} ${world?.name ?? ''} ${person?.together_character_templates.name ?? ''}`.toLowerCase().includes(query);
}

function matchesPhotoQuery(snapshot: Snapshot, media: GeneratedMedia, title: string, query: string): boolean {
  if (!query) return true;
  const place = snapshot.locations.find((item) => item.id === media.location_id);
  const world = place ? snapshot.worlds.find((item) => item.id === place.world_id) : undefined;
  const person = snapshot.characters.find((item) => item.id === media.character_instance_id);
  return `${title} ${place?.name ?? ''} ${world?.name ?? ''} ${person?.together_character_templates.name ?? ''}`.toLowerCase().includes(query);
}

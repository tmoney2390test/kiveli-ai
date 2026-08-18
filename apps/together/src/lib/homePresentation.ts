import type { CharacterInstance, GeneratedMedia, Memory, Snapshot } from '../types';
import type { HomeViewModel } from './homeViewModel';
import { getInterruptibilityPresentation } from './lifePresentation';
import { presentMemoryText } from './memoryPresentation';

export type CompanionMediaItem = {
  id: string;
  type: 'image' | 'video' | 'gif';
  url: string;
  thumbnailUrl?: string;
  title: string;
  subtitle: string;
  timestamp: string;
  locked: boolean;
  context?: string;
};

export type CurrentScenePresentation = {
  eyebrow: string;
  heading: string;
  activity: string;
  location: string;
  quote: string;
};

export function getCurrentScenePresentation(model: HomeViewModel): CurrentScenePresentation {
  const name = model.companion.together_character_templates.name;
  const togetherNow = /^together now/i.test(model.hero.notice ?? '');
  const activity = model.hero.statusLine.split('·').at(-1)?.trim() || humanize(model.companion.current_activity);
  const location = model.currentLocation?.name ?? model.currentWorld?.name ?? 'Their world';
  const atHome = model.currentLocation?.location_type === 'residence';
  const heading = togetherNow
    ? `You're with ${name} right now`
    : atHome
      ? `${name}'s taking a quiet moment`
      : `Step into ${name}'s day`;
  return {
    eyebrow: togetherNow ? 'TOGETHER NOW' : 'RIGHT NOW',
    heading,
    activity,
    location,
    quote: model.message?.content ?? (model.companion.current_interruptibility&&model.companion.current_interruptibility!=='open'?getInterruptibilityPresentation(model.companion.current_interruptibility).label:sceneQuote(name, model.companion.current_activity)),
  };
}

export function getRelationshipPresentation(snapshot: Snapshot, companion: CharacterInstance, day: number) {
  const cue = snapshot.relationshipCues?.[companion.id];
  const stage = companion.relationship_stage;
  const headline = cue?.tone === 'tense'
    ? 'Something between you needs attention.'
    : cue?.tone === 'spark'
      ? 'There’s a spark neither of you is ignoring.'
      : stage === 'stranger'
        ? 'This is only the beginning.'
        : stage === 'acquaintance'
          ? 'You’re starting to feel familiar.'
          : stage === 'friend'
            ? 'Things feel easier between you.'
            : ['flirting', 'dating'].includes(stage)
              ? 'Something is changing between you.'
              : 'You’ve built something real together.';
  return { headline, detail: cue?.detail ?? `Day ${day} of your story together.` };
}

export function getWorldHook(model: HomeViewModel) {
  const name = model.companion.together_character_templates.name;
  if (model.message) return `There’s something new from ${name}.`;
  if (model.hero.notice) return model.hero.notice;
  if (model.upcoming.action.kind !== 'plan-create') return `${model.upcoming.title} is getting closer.`;
  if (model.memory.empty) return `You and ${name} are just getting started.`;
  return `${name} is carrying something from your story with her.`;
}

export function getMemoryPresentation(memory: Pick<Memory, 'canonical_text' | 'memory_type'> | undefined, companionName: string) {
  if (!memory) return { eyebrow: 'YOUR STORY', text: `You and ${companionName} are just getting started.` };
  return {
    eyebrow: memory.memory_type === 'relationship' ? 'BETWEEN YOU' : memory.memory_type === 'episodic' ? 'A SHARED MOMENT' : `${companionName.toUpperCase()} REMEMBERS`,
    text: presentMemoryText(memory.canonical_text, companionName),
  };
}

export function selectFeaturedMemory(snapshot: Snapshot, companionId: string) {
  return [...snapshot.memories]
    .filter((item) => item.character_instance_id === companionId && item.status === 'active' && item.memory_type !== 'open_thread')
    .sort((left, right) => Number(right.pinned) - Number(left.pinned) || right.importance - left.importance || new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime())[0];
}

export function getCompanionMedia(snapshot: Snapshot, companionId: string): CompanionMediaItem[] {
  return (snapshot.generatedMedia ?? [])
    .filter((item): item is GeneratedMedia & { signed_url: string } => item.character_instance_id === companionId && item.status === 'ready' && Boolean(item.signed_url))
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
    .map((item) => {
      const moment = item.moment_id ? snapshot.moments.find((entry) => entry.id === item.moment_id) : undefined;
      const event = item.life_event_id ? snapshot.lifeEvents.find((entry) => entry.id === item.life_event_id) : undefined;
      const date = item.date_session_id ? snapshot.dates.find((entry) => entry.id === item.date_session_id) : undefined;
      const location = item.location_id ? snapshot.locations.find((entry) => entry.id === item.location_id) : undefined;
      const metadata = item.metadata ?? {};
      const locked = metadata.locked === true || metadata.visibility === 'private_locked';
      return {
        id: item.id,
        type: 'image' as const,
        url: item.signed_url,
        thumbnailUrl: item.signed_url,
        title: String(metadata.title ?? moment?.title ?? event?.title ?? date?.together_date_templates.name ?? 'A moment from today'),
        subtitle: location?.name ?? String(metadata.context ?? 'From your shared world'),
        timestamp: item.created_at,
        locked,
        context: moment ? 'MEMORY' : date ? 'DATE' : event ? 'TODAY' : 'FROM HER',
      };
    });
}

function sceneQuote(name: string, activity: string) {
  const value = activity.toLowerCase();
  if (value.includes('photo')) return '“I think I found something worth showing you.”';
  if (value.includes('coffee')) return '“I found a quiet corner. You’d like it here.”';
  if (value.includes('work') || value.includes('design') || value.includes('project')) return '“I’m in the middle of something. Come distract me for a minute.”';
  if (value.includes('rest') || value.includes('sleep') || value.includes('offline')) return '“I finally have a quiet minute.”';
  return `“Come keep me company for a minute.” — ${name}`;
}

function humanize(value: string) {
  return value.trim().replace(/[_-]+/g, ' ').replace(/^[a-z]/, (letter) => letter.toUpperCase()) || 'Living the day';
}

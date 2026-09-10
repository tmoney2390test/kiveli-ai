import type { Moment, Snapshot } from '../types';
import { getCompanionMedia, type CompanionMediaItem } from './homePresentation';
import { mostRecentHomeConversation, type HomeViewModel } from './homeViewModel';

export type HomeSharedItem = { kind: 'media'; item: CompanionMediaItem } | { kind: 'moment'; item: Moment };

/** Keep chat and planning attached to the saved scenario, including when another chat was used more recently. */
export function homeChatHref(snapshot: Snapshot, model: HomeViewModel, planning = false) {
  const conversationId = model.companion.scenario_state?.conversationId ?? mostRecentHomeConversation(snapshot)?.id;
  return `/chat?character=${encodeURIComponent(model.companion.id)}${conversationId ? `&conversationId=${encodeURIComponent(conversationId)}` : ''}${planning ? '&plan=1' : ''}`;
}

export function homeNextItem(model: HomeViewModel) {
  const scenario = model.companion.scenario_state;
  if (scenario) return { eyebrow: 'YOUR ACTIVE SCENARIO', title: scenario.title, meta: 'Daily schedule paused · You can still make plans', label: 'Continue scenario', kind: 'scenario' as const };
  if (model.upcoming.eyebrow === 'DATE IDEA' || model.upcoming.action.kind === 'plan-create') {
    return { eyebrow: 'UP NEXT', title: 'Plan something together', meta: 'Make time for your next moment', label: 'Plan an event', kind: 'planning' as const };
  }
  return { ...model.upcoming, label: model.upcoming.action.label, kind: 'scheduled' as const };
}

export function homeSharedItems(snapshot: Snapshot, model: HomeViewModel): HomeSharedItem[] {
  const media = getCompanionMedia(snapshot, model.companion.id);
  const mediaIds = new Set(media.map(item => item.id));
  const illustratedMoments = new Set((snapshot.generatedMedia ?? []).filter(item => mediaIds.has(item.id)).map(item => item.moment_id));
  return [
    ...media.map(item => ({ kind: 'media' as const, item })),
    ...model.recentMoments.filter(item => !illustratedMoments.has(item.id)).map(item => ({ kind: 'moment' as const, item })),
  ].sort((a, b) => new Date(b.kind === 'media' ? b.item.timestamp : b.item.occurred_at).getTime() - new Date(a.kind === 'media' ? a.item.timestamp : a.item.occurred_at).getTime()).slice(0, 4);
}

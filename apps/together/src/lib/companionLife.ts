import type { CharacterInstance, CharacterScheduleEvent, Snapshot } from '../types';
import { worldForLocation } from './place';
import { selectActiveCompanion, selectCompanionLife } from './selectors';
import { currentScheduleEvent, getScheduleHint, nextVisibleScheduleEvents } from './lifePresentation';

export type CompanionLifeSnapshot = {
  companion: CharacterInstance;
  relationship: Snapshot['relationships'][number] | undefined;
  relationshipDay: number;
  location: Snapshot['locations'][number] | undefined;
  recentEvents: Snapshot['lifeEvents'];
  upcomingSchedule: Array<CharacterScheduleEvent & { locationName: string; startsAt: Date; endsAt: Date; activity:string }>;
  proactiveMessages: Snapshot['proactiveMessages'];
  dates: Snapshot['dates'];
  moments: Snapshot['moments'];
  memories: Snapshot['memories'];
  openThreads: Snapshot['openThreads'];
  activeConversation: Snapshot['conversations'][number] | undefined;
  activeStories: NonNullable<Snapshot['storyArcs']>;
  recentMedia: NonNullable<Snapshot['generatedMedia']>;
};

export function activeCompanion(snapshot: Snapshot, companionId?: string): CharacterInstance | undefined {
  return selectActiveCompanion(snapshot, companionId);
}

export function buildCompanionLife(snapshot: Snapshot, now = new Date(), companionId?: string): CompanionLifeSnapshot | undefined {
  const companion = activeCompanion(snapshot, companionId);
  if (!companion) return undefined;
  const scoped = selectCompanionLife(snapshot, companion.id);
  const currentEvent=currentScheduleEvent(snapshot.scheduleEvents,companion.id,now,companion.current_schedule_event_id);
  const activeConversation=snapshot.conversations.find((conversation)=>conversation.character_instance_id===companion.id&&!conversation.archived_at&&['direct','first_meeting'].includes(conversation.kind));
  const location = snapshot.locations.find((item) => item.id === (currentEvent?.location_id??companion.current_location_id));
  const currentWorld=worldForLocation(snapshot,location?.id??companion.current_location_id);
  const upcomingSchedule = nextVisibleScheduleEvents(snapshot.scheduleEvents,companion.id,now).slice(0,3).map((item)=>({ ...item, startsAt:new Date(item.starts_at), endsAt:new Date(item.ends_at), activity:getScheduleHint(item)??item.title, locationName:snapshot.locations.find((place)=>place.id===item.location_id)?.name??currentWorld?.name??'Current world' }));
  return {
    companion,
    relationship: scoped.relationship,
    relationshipDay: Math.max(1, Math.floor((now.getTime() - new Date(companion.met_at || companion.contact_added_at || now.toISOString()).getTime()) / 86400000) + 1),
    location,
    recentEvents: scoped.events.filter((event) => event.user_should_know !== false&&new Date(event.starts_at).getTime()<=now.getTime()).sort((left,right)=>new Date(right.starts_at).getTime()-new Date(left.starts_at).getTime()).slice(0, 8),
    upcomingSchedule,
    proactiveMessages: scoped.proactiveMessages.sort((left,right)=>new Date(right.eligible_at??0).getTime()-new Date(left.eligible_at??0).getTime()),
    dates: scoped.dates.sort((left,right)=>dateRank(left.status)-dateRank(right.status)||new Date(right.completed_at??0).getTime()-new Date(left.completed_at??0).getTime()),
    moments: scoped.moments.sort((left,right)=>new Date(right.occurred_at).getTime()-new Date(left.occurred_at).getTime()),
    memories: scoped.memories.sort((left,right)=>Number(right.pinned)-Number(left.pinned)||right.importance-left.importance||new Date(right.updated_at).getTime()-new Date(left.updated_at).getTime()),
    openThreads: scoped.threads.sort((left,right)=>Number(right.follow_up_eligible)-Number(left.follow_up_eligible)||new Date(left.expected_at??'9999-12-31').getTime()-new Date(right.expected_at??'9999-12-31').getTime()),
    activeConversation,
    activeStories:scoped.stories.filter((story)=>story.status==='active'),
    recentMedia:scoped.media.filter((media)=>media.status==='ready').sort((left,right)=>new Date(right.created_at).getTime()-new Date(left.created_at).getTime()),
  };
}

export function formatScheduleTime(value: Date,timezone?:string): string { return value.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit',...(timezone?{timeZone:timezone}:{}) }); }
function dateRank(status:string){return ({active:0,upcoming:1,unlocked:2,deferred:2,locked:3,completed:4} as Record<string,number>)[status]??5;}


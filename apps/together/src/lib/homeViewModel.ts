import type { CharacterInstance, Location, Memory, Moment, Snapshot, World } from '../types';
import { buildCompanionLife } from './companionLife';
import { mostRecentlyUsedConversation } from './conversation';
import { worldForLocation } from './place';
import { currentScheduleEvent, getScheduleEventPresentation, getScheduleHint, nextVisibleScheduleEvents } from './lifePresentation';

export type HomeTargetAction =
  | { kind: 'chat'; label: string; proactiveMessageId?: string }
  | { kind: 'plan'; label: string; id: string }
  | { kind: 'date'; label: string; id: string }
  | { kind: 'plan-create'; label: string };

export type HomeTimelineItem = {
  id: string;
  kind: 'event' | 'now' | 'schedule' | 'plan' | 'date';
  title: string;
  detail?: string;
  time: string;
  locationId?: string | null;
  current?: boolean;
};

export type HomeViewModel = {
  companion: CharacterInstance;
  relationshipDay: number;
  currentLocation?: Location;
  currentWorld?: World;
  hero: {
    stage: string;
    statusLine: string;
    prompt: string;
    notice: string | null;
    action: HomeTargetAction;
  };
  message?: {
    id: string;
    content: string;
    time: string;
  };
  upcoming: {
    eyebrow: string;
    title: string;
    meta: string;
    action: HomeTargetAction;
  };
  memory: {
    eyebrow: string;
    title: string;
    meta: string;
    empty: boolean;
  };
  timeline: HomeTimelineItem[];
  recentMoments: Moment[];
};

type ZonedClock = {
  timezone: string;
  dateKey: string;
  weekday: number;
  minuteOfDay: number;
};

type FutureTimelineCandidate = HomeTimelineItem & { sortMinute: number };

export function mostRecentHomeConversation(snapshot:Snapshot){
  const characterIds=new Set(snapshot.characters.map((character)=>character.id));
  return mostRecentlyUsedConversation(snapshot.conversations.filter((conversation)=>characterIds.has(conversation.character_instance_id)));
}

export function mostRecentHomeCompanion(snapshot:Snapshot):CharacterInstance|undefined{
  const conversation=mostRecentHomeConversation(snapshot);
  return conversation?snapshot.characters.find((character)=>character.id===conversation.character_instance_id):undefined;
}

export function buildHomeViewModel(snapshot: Snapshot, now = new Date()): HomeViewModel | undefined {
  const homeConversation=mostRecentHomeConversation(snapshot);
  if(!homeConversation)return undefined;
  const life = buildCompanionLife(snapshot, now, homeConversation.character_instance_id, homeConversation.id);
  if (!life) return undefined;

  const { companion, relationshipDay, recentEvents, dates } = life;
  const name = companion.together_character_templates.name;
  const scheduleCandidate=currentScheduleEvent(snapshot.scheduleEvents,companion.id,now,companion.current_schedule_event_id);
  const currentEvent=scheduleCandidate&&companion.current_presence_source==='schedule'&&scheduleCandidate.id===companion.current_schedule_event_id&&scheduleCandidate.location_id===companion.current_location_id?scheduleCandidate:undefined;
  const currentLocation = snapshot.locations.find((item) => item.id === companion.current_location_id);
  const currentWorld = worldForLocation(snapshot, currentLocation?.id ?? companion.current_location_id);
  const timezone = snapshot.profile?.experience_timezone || 'UTC';
  const clock = zonedClock(now, timezone);
  const homePresence = currentWorld
    ? (snapshot.characterWorldPresence ?? []).find((item) => item.character_version_id === companion.character_version_id && item.world_id === currentWorld.id)
    : undefined;
  const atHome = Boolean(currentLocation && currentLocation.location_type === 'residence' && homePresence?.home_location_id === currentLocation.id);
  const locationLabel = atHome ? 'At home' : currentLocation ? `At ${currentLocation.name}` : currentWorld ? `In ${currentWorld.name}` : 'In the world';
  const activityLabel = currentEvent?getScheduleEventPresentation(currentEvent).activity:humanizeActivity(companion.current_activity);
  const interruptibility=currentEvent?.interruptibility??companion.current_interruptibility??'open';

  const activeConversation = life.activeConversation;
  const unreadMessage = life.proactiveMessages
    .filter((item) => item.status === 'sent' && activeConversation?.unread === true && item.conversation_id === activeConversation.id && Boolean(item.sent_message_id) && (!item.eligible_at || new Date(item.eligible_at).getTime() <= now.getTime()) && (!item.expires_at || new Date(item.expires_at).getTime() > now.getTime()))
    .sort((left, right) => new Date(right.eligible_at ?? 0).getTime() - new Date(left.eligible_at ?? 0).getTime())[0];
  const relationshipCue = snapshot.relationshipCues?.[companion.id];
  const pendingMilestone = snapshot.relationshipMilestones?.find((item) => item.character_instance_id === companion.id && item.status === 'pending');
  const activeDate = dates.find((item) => item.status === 'active');
  const activePlan = snapshot.sharedPlans
    .filter((plan) => plan.character_instance_id === companion.id && plan.status === 'active' && isWithinPlanWindow(plan, now))
    .sort((left, right) => new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime())[0];
  const nextPlan = snapshot.sharedPlans
    .filter((plan) => plan.character_instance_id === companion.id && plan.status === 'scheduled' && new Date(plan.starts_at).getTime() > now.getTime())
    .sort((left, right) => new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime())[0];
  const nextDate = dates
    .filter((item) => item.status === 'upcoming' && item.scheduled_for && new Date(item.scheduled_for).getTime() > now.getTime())
    .sort((left, right) => new Date(left.scheduled_for ?? 0).getTime() - new Date(right.scheduled_for ?? 0).getTime())[0];
  const readyDate = dates.find((item) => item.status === 'unlocked' || item.status === 'deferred');

  const restful = isRestfulActivity(companion.current_activity);
  const heroAction: HomeTargetAction = activeDate
    ? { kind: 'date', id: activeDate.id, label: 'Continue date' }
    : activePlan
      ? { kind: 'plan', id: activePlan.id, label: 'Continue together' }
      : pendingMilestone
        ? { kind: 'chat', label: `Answer ${name}` }
        : unreadMessage
          ? { kind: 'chat', label: `Reply to ${name}`, proactiveMessageId: unreadMessage.id }
          : relationshipCue?.tone === 'tense'
            ? { kind: 'chat', label: 'Talk it through' }
            : restful && atHome
              ? { kind: 'chat', label: `Keep ${name} company` }
              : ['busy','unavailable'].includes(interruptibility)
                ? { kind: 'chat', label: `Check in with ${name}` }
                : { kind: 'chat', label: `Talk to ${name}` };

  const heroNotice = activeDate
    ? `Together now · ${activeDate.together_date_templates.name}`
    : activePlan
      ? `Together now · ${activePlan.title}`
      : pendingMilestone
        ? pendingMilestone.title
        : unreadMessage
          ? `New message from ${name}`
          : relationshipCue?.tone === 'tense'
            ? relationshipCue.detail
            : null;

  const heroPrompt = activeDate
    ? 'Your time together is already in progress.'
    : activePlan
      ? 'You have something happening together right now.'
      : pendingMilestone
        ? pendingMilestone.body
        : unreadMessage
          ? 'There is something new waiting for you.'
          : relationshipCue?.tone === 'warm' || relationshipCue?.tone === 'spark' || relationshipCue?.tone === 'tense'
            ? relationshipCue.detail
            : restful
              ? 'A quieter moment in the day.'
              : ['busy','unavailable'].includes(interruptibility)
                ? 'In the middle of something right now.'
                : `${name}'s day is still unfolding.`;

  const upcoming = buildUpcomingCard({ activeDate, activePlan, nextPlan, nextDate, readyDate, timezone });
  const memory = selectHomeMemory(life.memories, now);
  const timeline = buildTimeline({
    snapshot,
    companion,
    recentEvents,
    currentLocation,
    currentWorld,
    atHome,
    activityLabel,
    clock,
    now,
  });

  return {
    companion,
    relationshipDay,
    currentLocation,
    currentWorld,
    hero: {
      stage: labelStage(companion.relationship_stage),
      statusLine: `${locationLabel} · ${activityLabel}`,
      prompt: heroPrompt,
      notice: heroNotice,
      action: heroAction,
    },
    message: unreadMessage ? {
      id: unreadMessage.id,
      content: unreadMessage.content,
      time: relativeTime(unreadMessage.eligible_at ?? now.toISOString(), now),
    } : undefined,
    upcoming,
    memory,
    timeline,
    recentMoments: life.moments
      .filter((moment) => now.getTime() - new Date(moment.occurred_at).getTime() <= 72 * 3600000)
      .slice(0, 3),
  };
}

function buildUpcomingCard({ activeDate, activePlan, nextPlan, nextDate, readyDate, timezone }: {
  activeDate: Snapshot['dates'][number] | undefined;
  activePlan: Snapshot['sharedPlans'][number] | undefined;
  nextPlan: Snapshot['sharedPlans'][number] | undefined;
  nextDate: Snapshot['dates'][number] | undefined;
  readyDate: Snapshot['dates'][number] | undefined;
  timezone: string;
}): HomeViewModel['upcoming'] {
  if (activeDate) return {
    eyebrow: 'TOGETHER NOW',
    title: activeDate.together_date_templates.name,
    meta: 'Your date is in progress',
    action: { kind: 'date', id: activeDate.id, label: 'Continue date' },
  };
  if (activePlan) return {
    eyebrow: 'TOGETHER NOW',
    title: activePlan.title,
    meta: 'Happening now',
    action: { kind: 'plan', id: activePlan.id, label: 'Continue together' },
  };

  const planTime = nextPlan ? new Date(nextPlan.starts_at).getTime() : Number.POSITIVE_INFINITY;
  const dateTime = nextDate?.scheduled_for ? new Date(nextDate.scheduled_for).getTime() : Number.POSITIVE_INFINITY;
  if (nextPlan && planTime <= dateTime) return {
    eyebrow: 'UPCOMING',
    title: nextPlan.title,
    meta: formatWeekdayTime(nextPlan.starts_at, timezone),
    action: { kind: 'plan', id: nextPlan.id, label: 'View plan' },
  };
  if (nextDate?.scheduled_for) return {
    eyebrow: 'UPCOMING',
    title: nextDate.together_date_templates.name,
    meta: formatWeekdayTime(nextDate.scheduled_for, timezone),
    action: { kind: 'date', id: nextDate.id, label: 'View date' },
  };
  if (readyDate) return {
    eyebrow: 'DATE IDEA',
    title: readyDate.together_date_templates.name,
    meta: 'Ready when you are',
    action: { kind: 'date', id: readyDate.id, label: 'View date' },
  };
  return {
    eyebrow: 'UPCOMING',
    title: 'Plan something',
    meta: 'Make time together',
    action: { kind: 'plan-create', label: 'Plan something' },
  };
}

function selectHomeMemory(memories: Memory[], now: Date): HomeViewModel['memory'] {
  const memory = [...memories]
    .filter((item) => item.status === 'active' && item.memory_type !== 'open_thread')
    .sort((left, right) => Number(right.pinned) - Number(left.pinned)
      || memoryTypeRank(right.memory_type) - memoryTypeRank(left.memory_type)
      || right.importance - left.importance
      || new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime())[0];
  if (!memory) return {
    eyebrow: 'MEMORY',
    title: 'Your story is taking shape',
    meta: 'Shared details will collect here',
    empty: true,
  };
  return {
    eyebrow: 'MEMORY',
    title: memory.canonical_text,
    meta: `Saved ${relativeTime(memory.updated_at || memory.created_at, now)}`,
    empty: false,
  };
}

function buildTimeline({ snapshot, companion, recentEvents, currentLocation, currentWorld, atHome, activityLabel, clock, now }: {
  snapshot: Snapshot;
  companion: CharacterInstance;
  recentEvents: Snapshot['lifeEvents'];
  currentLocation: Location | undefined;
  currentWorld: World | undefined;
  atHome: boolean;
  activityLabel: string;
  clock: ZonedClock;
  now: Date;
}): HomeTimelineItem[] {
  const pastEvents = recentEvents
    .filter((event) => localDateKey(event.starts_at, clock.timezone) === clock.dateKey && new Date(event.starts_at).getTime() <= now.getTime())
    .sort((left, right) => new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime())
    .slice(-2)
    .map<HomeTimelineItem>((event) => ({
      id: `event:${event.id}`,
      kind: 'event',
      title: event.title,
      detail: event.narrative_summary,
      time: formatTime(event.starts_at, clock.timezone),
      locationId: event.location_id,
    }));

  const nowRow: HomeTimelineItem = {
    id: `now:${companion.id}`,
    kind: 'now',
    title: activityLabel,
    detail: atHome ? 'Home' : currentLocation?.name ?? currentWorld?.name ?? 'Current place',
    time: 'Now',
    locationId: currentLocation?.id,
    current: true,
  };

  const future: FutureTimelineCandidate[] = [];
  const persistedSchedule=nextVisibleScheduleEvents(snapshot.scheduleEvents,companion.id,now);
  for (const item of persistedSchedule) {
    if (localDateKey(item.starts_at,clock.timezone)!==clock.dateKey) continue;
    const hint=getScheduleHint(item);if(!hint)continue;
    future.push({
      id: `schedule:${item.id}`,
      kind: 'schedule',
      title: hint,
      detail: snapshot.locations.find((location) => location.id === item.location_id)?.name ?? currentWorld?.name ?? 'Current place',
      time: formatTime(item.starts_at,clock.timezone),
      locationId: item.location_id,
      sortMinute: minuteInZone(item.starts_at,clock.timezone),
    });
  }
  if(!persistedSchedule.length){
    for(const item of snapshot.schedules){
      if(item.character_version_id!==companion.character_version_id||item.day_of_week!==clock.weekday||item.start_minute<=clock.minuteOfDay)continue;
      if(currentWorld&&worldForLocation(snapshot,item.location_id)?.id!==currentWorld.id)continue;
      future.push({id:`legacy-schedule:${item.id}:${item.start_minute}`,kind:'schedule',title:humanizeActivity(item.activity),detail:snapshot.locations.find((location)=>location.id===item.location_id)?.name??currentWorld?.name??'Current place',time:formatScheduleMinute(item.start_minute),locationId:item.location_id,sortMinute:item.start_minute});
    }
  }
  for (const plan of snapshot.sharedPlans) {
    if (plan.character_instance_id !== companion.id || plan.status !== 'scheduled' || new Date(plan.starts_at).getTime() <= now.getTime()) continue;
    if (localDateKey(plan.starts_at, clock.timezone) !== clock.dateKey) continue;
    future.push({
      id: `plan:${plan.id}`,
      kind: 'plan',
      title: plan.title,
      detail: snapshot.locations.find((location) => location.id === plan.location_id)?.name ?? 'Together',
      time: formatTime(plan.starts_at, clock.timezone),
      locationId: plan.location_id,
      sortMinute: minuteInZone(plan.starts_at, clock.timezone),
    });
  }
  for (const plan of snapshot.sharedPlans) {
    if (plan.character_instance_id !== companion.id || plan.status !== 'scheduled' || new Date(plan.starts_at).getTime() <= now.getTime()) continue;
    if (localDateKey(plan.starts_at, clock.timezone) !== clock.dateKey) continue;
    future.push({
      id: `plan:${plan.id}`,
      kind: 'plan',
      title: plan.title,
      detail: snapshot.locations.find((location) => location.id === plan.location_id)?.name ?? 'Together',
      time: formatTime(plan.starts_at, clock.timezone),
      locationId: plan.location_id,
      sortMinute: minuteInZone(plan.starts_at, clock.timezone),
    });
  }
  for (const date of snapshot.dates) {
    if (date.character_instance_id !== companion.id || date.status !== 'upcoming' || !date.scheduled_for || new Date(date.scheduled_for).getTime() <= now.getTime()) continue;
    if (localDateKey(date.scheduled_for, clock.timezone) !== clock.dateKey) continue;
    future.push({
      id: `date:${date.id}`,
      kind: 'date',
      title: date.together_date_templates.name,
      detail: 'Date',
      time: formatTime(date.scheduled_for, clock.timezone),
      locationId: date.together_date_templates.location_id ?? null,
      sortMinute: minuteInZone(date.scheduled_for, clock.timezone),
    });
  }

  future.sort((left, right) => left.sortMinute - right.sortMinute);
  const remaining = Math.max(0, 3 - pastEvents.length);
  const nextItems = future.slice(0, remaining).map<HomeTimelineItem>((candidate) => ({
    id: candidate.id,
    kind: candidate.kind,
    title: candidate.title,
    detail: candidate.detail,
    time: candidate.time,
    locationId: candidate.locationId,
    current: candidate.current,
  }));
  return [...pastEvents, nowRow, ...nextItems].slice(0, 4);
}

export function labelStage(stage: string) {
  const labels: Record<string, string> = {
    stranger: 'Just met',
    acquaintance: 'Getting acquainted',
    friend: 'Getting closer',
    flirting: 'There’s a spark',
    dating: 'Dating',
    exclusive: 'Exclusive',
    long_term: 'Building a life',
  };
  return labels[stage] ?? 'Getting closer';
}

export function humanizeActivity(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return 'Living the day';
  if (normalized.includes('offline for the night')) return 'Winding down';
  if (normalized.includes('sleep')) return 'Sleeping';
  if (normalized.includes('rest')) return 'Resting';
  if (normalized.includes('design')) return 'Designing';
  if (normalized.includes('photo walk')) return 'On a photo walk';
  if (normalized.includes('meeting friends')) return 'Out with friends';
  if (normalized.includes('coffee')) return 'Grabbing coffee';
  if (normalized.includes('working') || normalized.includes('producing') || normalized.includes('project')) return 'Working';
  return value[0] ? value[0].toUpperCase() + value.slice(1) : value;
}

function isRestfulActivity(value: string) {
  const normalized = value.toLowerCase();
  return normalized.includes('offline') || normalized.includes('sleep') || normalized.includes('rest') || normalized.includes('winding down');
}

function memoryTypeRank(type: Memory['memory_type']) {
  return ({ preference: 6, semantic: 5, episodic: 4, relationship: 3, emotional: 2, open_thread: 1 } as Record<Memory['memory_type'], number>)[type];
}

function zonedClock(value: Date, timezone: string): ZonedClock {
  const parts = zonedParts(value, timezone);
  return {
    timezone,
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: weekdayIndex(parts.weekday),
    minuteOfDay: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function zonedParts(value: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), weekday: get('weekday') };
}

function weekdayIndex(value: string) {
  const index = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(value);
  return index >= 0 ? index : 0;
}

function localDateKey(value: string | Date, timezone: string) {
  const parts = zonedParts(typeof value === 'string' ? new Date(value) : value, timezone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function minuteInZone(value: string | Date, timezone: string) {
  const parts = zonedParts(typeof value === 'string' ? new Date(value) : value, timezone);
  return Number(parts.hour) * 60 + Number(parts.minute);
}

function formatTime(value: string | Date, timezone: string) {
  return new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit' }).format(typeof value === 'string' ? new Date(value) : value);
}

function formatWeekdayTime(value: string, timezone: string) {
  const date = new Date(value);
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(date);
  return `${weekday} · ${formatTime(date, timezone)}`;
}

function isWithinPlanWindow(plan: Snapshot['sharedPlans'][number], now: Date) {
  const starts = new Date(plan.starts_at).getTime();
  const ends = new Date(plan.ends_at).getTime();
  return Number.isFinite(starts) && Number.isFinite(ends) && starts <= now.getTime() && now.getTime() < ends;
}

function formatScheduleMinute(value:number){const hour24=Math.floor(value/60),minute=value%60,suffix=hour24>=12?'PM':'AM',hour=hour24%12||12;return`${hour}:${String(minute).padStart(2,'0')} ${suffix}`;}

function relativeTime(value: string, now: Date) {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(value).getTime()) / 60000));
  if (minutes < 2) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

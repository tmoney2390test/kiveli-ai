import { commitmentTemporalState, type Commitment, type CommitmentTemporalState } from './commitments';

export type PlanPrimaryAction = 'start' | null;

export type PlanActionAvailability = {
  temporal: CommitmentTemporalState;
  userPresent: boolean;
  primary: PlanPrimaryAction;
  primaryEnabled: boolean;
  canEnd: boolean;
  canCancel: boolean;
  canEdit: boolean;
};

export type ConversationPlanMenuItem = {
  key: 'createPlan' | 'changePlan' | 'endPlan';
  label: 'Plan something' | 'Change plan' | 'End plan';
  danger?: boolean;
};

export function conversationPlanMenuItems(hasActivePlan: boolean): ConversationPlanMenuItem[] {
  return hasActivePlan
    ? [{ key: 'changePlan', label: 'Change plan' }, { key: 'endPlan', label: 'End plan', danger: true }]
    : [{ key: 'createPlan', label: 'Plan something' }];
}

export function planActionAvailability(plan: Commitment, now = new Date()): PlanActionAvailability {
  const temporal = plan.temporalState ?? commitmentTemporalState(plan, now);
  const userPresent = Boolean(plan.attendance?.user && !plan.attendance.user.left_at);
  const terminal = ['completed', 'missed', 'cancelled'].includes(plan.status);
  const canEdit = ['proposed', 'scheduled'].includes(plan.status);
  const canCancel = canEdit;

  if (terminal) return { temporal, userPresent, primary: null, primaryEnabled: false, canEnd: false, canCancel: false, canEdit: false };
  if (plan.status === 'active' && userPresent) return { temporal, userPresent, primary: null, primaryEnabled: false, canEnd: plan.source !== 'date', canCancel: false, canEdit: false };

  const canStart = plan.participation_mode !== 'ambient'
    && !userPresent
    && ['en_route', 'imminent', 'active', 'grace'].includes(temporal);
  const showStart = Boolean(plan.starts_at) && ['scheduled', 'active'].includes(plan.status);
  return { temporal, userPresent, primary: showStart ? 'start' : null, primaryEnabled: canStart, canEnd: false, canCancel, canEdit };
}

/** The active plan shown in chat must be one the user is actually attending. */
export function activePlanForChat<T extends Commitment>(plans: T[], characterInstanceId: string): T | null {
  return plans
    .filter((plan) => plan.character_instance_id === characterInstanceId
      && plan.status === 'active'
      && Boolean(plan.attendance?.user && !plan.attendance.user.left_at))
    .sort((left, right) => {
      const leftJoined = new Date(left.attendance?.user?.joined_at ?? left.starts_at ?? 0).getTime();
      const rightJoined = new Date(right.attendance?.user?.joined_at ?? right.starts_at ?? 0).getTime();
      return rightJoined - leftJoined;
    })[0] ?? null;
}

/** Keep elapsed attended plans visible to lifecycle reconciliation until the server closes them. */
export function attendedPlansForLifecycleReconciliation<T extends Commitment>(plans: T[], characterInstanceId: string): T[] {
  return plans
    .filter((plan) => plan.character_instance_id === characterInstanceId
      && plan.source !== 'date'
      && ['scheduled', 'active'].includes(plan.status)
      && Boolean(plan.attendance?.user && !plan.attendance.user.left_at)
      && Number.isFinite(new Date(plan.ends_at ?? '').getTime()))
    .sort((left, right) => new Date(left.ends_at ?? 0).getTime() - new Date(right.ends_at ?? 0).getTime());
}

/** Surface one current plan the user can actually join from the chat footer. */
export function joinablePlanForChat<T extends Commitment>(plans: T[], characterInstanceId: string, now = new Date()): T | null {
  return plans
    .filter((plan) => plan.character_instance_id === characterInstanceId
      && planActionAvailability(plan, now).primary === 'start'
      && planActionAvailability(plan, now).primaryEnabled)
    .sort((left, right) => new Date(left.starts_at ?? 0).getTime() - new Date(right.starts_at ?? 0).getTime())[0] ?? null;
}

const lifecycleDividerTypes = new Set(['plan_created', 'plan_joined', 'plan_completed']);

export function isPlanLifecycleDividerEvent(event: { event_type: string }): boolean {
  return lifecycleDividerTypes.has(event.event_type);
}

export function planLifecycleDividerLabel(event: { event_type: string }, companionName: string): string | null {
  const firstName = companionName.trim().split(/\s+/)[0] || companionName;
  if (event.event_type === 'plan_created') return `Plan scheduled with ${firstName}`;
  if (event.event_type === 'plan_joined') return `Plan started with ${firstName}`;
  if (event.event_type === 'plan_completed') return `Plan ended with ${firstName}`;
  return null;
}

/** A switch emits one compact event; hide the completion event it supersedes. */
export function shouldShowPlanTimelineEvent(event: { event_type: string; created_at?: string; metadata?: Record<string, unknown> }): boolean {
  if (event.event_type === 'plan_completed' && typeof event.metadata?.switchedToPlanId === 'string') return false;
  if (event.event_type !== 'plan_created') return true;
  if (event.metadata?.immediate === true || event.metadata?.timingChoice === 'now') return false;
  const startsAt = typeof event.metadata?.startsAt === 'string' ? new Date(event.metadata.startsAt).getTime() : Number.NaN;
  const createdAt = event.created_at ? new Date(event.created_at).getTime() : Number.NaN;
  return !Number.isFinite(startsAt) || !Number.isFinite(createdAt) || startsAt - createdAt > 10 * 60_000;
}

type PlanTimelineEvent = {
  id: string;
  entity_id: string;
  entity_type: string;
  event_type: string;
  created_at: string;
  metadata?: Record<string, unknown>;
};

/** Keep one marker per lifecycle stage and one latest card for other changes. */
export function collapsePlanTimelineEvents<T extends PlanTimelineEvent>(events: T[]): T[] {
  const visible = events.filter(shouldShowPlanTimelineEvent);
  const latestByCommitment = new Map<string, T>();
  for (const event of visible) {
    if (event.entity_type !== 'shared_plan' && event.entity_type !== 'date_session') continue;
    const lifecycle = isPlanLifecycleDividerEvent(event);
    const key = `${event.entity_type}:${event.entity_id}${lifecycle ? `:${event.event_type}` : ':detail'}`;
    const current = latestByCommitment.get(key);
    if (!current || new Date(event.created_at).getTime() > new Date(current.created_at).getTime()
      || (event.created_at === current.created_at && event.id > current.id)) latestByCommitment.set(key, event);
  }
  return visible.filter((event) => {
    if (event.entity_type !== 'shared_plan' && event.entity_type !== 'date_session') return true;
    const lifecycle = isPlanLifecycleDividerEvent(event);
    return latestByCommitment.get(`${event.entity_type}:${event.entity_id}${lifecycle ? `:${event.event_type}` : ':detail'}`)?.id === event.id;
  });
}

/** Do not offer to travel to the canonical place where this chat is already happening. */
export function shouldShowPlanConversationAction(action:{candidate_type?:string;payload:Record<string,unknown>},currentLocationId?:string|null,hasActivePlan=false):boolean{
  if(hasActivePlan&&['plan','plan_create','date'].includes(String(action.candidate_type??'')))return false;
  return !(currentLocationId
    && action.payload.trigger==='assistant_location_mention'
    && action.payload.locationId===currentLocationId);
}

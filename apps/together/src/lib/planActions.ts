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

/** A switch emits one compact event; hide the completion event it supersedes. */
export function shouldShowPlanTimelineEvent(event: { event_type: string; metadata?: Record<string, unknown> }): boolean {
  return !(event.event_type === 'plan_completed' && typeof event.metadata?.switchedToPlanId === 'string');
}

type PlanTimelineEvent = {
  id: string;
  entity_id: string;
  entity_type: string;
  event_type: string;
  created_at: string;
  metadata?: Record<string, unknown>;
};

/** Keep one canonical chat card while a commitment moves through its lifecycle. */
export function collapsePlanTimelineEvents<T extends PlanTimelineEvent>(events: T[]): T[] {
  const visible = events.filter(shouldShowPlanTimelineEvent);
  const latestByCommitment = new Map<string, T>();
  for (const event of visible) {
    if (event.entity_type !== 'shared_plan' && event.entity_type !== 'date_session') continue;
    const key = `${event.entity_type}:${event.entity_id}`;
    const current = latestByCommitment.get(key);
    if (!current || new Date(event.created_at).getTime() > new Date(current.created_at).getTime()
      || (event.created_at === current.created_at && event.id > current.id)) latestByCommitment.set(key, event);
  }
  return visible.filter((event) => {
    if (event.entity_type !== 'shared_plan' && event.entity_type !== 'date_session') return true;
    return latestByCommitment.get(`${event.entity_type}:${event.entity_id}`)?.id === event.id;
  });
}

/** Do not offer to travel to the canonical place where this chat is already happening. */
export function shouldShowPlanConversationAction(action:{payload:Record<string,unknown>},currentLocationId?:string|null):boolean{
  return !(currentLocationId
    && action.payload.trigger==='assistant_location_mention'
    && action.payload.locationId===currentLocationId);
}

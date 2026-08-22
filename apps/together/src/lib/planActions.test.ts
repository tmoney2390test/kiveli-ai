import { describe, expect, it, vi } from 'vitest';
vi.mock('./api', () => ({ invoke: vi.fn() }));
import { activePlanForChat, collapsePlanTimelineEvents, planActionAvailability, shouldShowPlanConversationAction, shouldShowPlanTimelineEvent } from './planActions';
import type { Commitment } from './commitments';

const now = new Date('2026-08-21T16:00:00.000Z');
const plan = (patch: Partial<Commitment> = {}): Commitment => ({
  id: 'plan-1', character_instance_id: 'character-1', title: 'Books at Paper Trail', activity_key: 'books',
  location_id: 'location-1', starts_at: '2026-08-21T16:10:00.000Z', ends_at: '2026-08-21T17:40:00.000Z',
  status: 'scheduled', participation_mode: 'live', attendance: { user: null, character: null }, ...patch,
});

describe('planActionAvailability', () => {
  it('starts a scheduled plan inside the join window', () => expect(planActionAvailability(plan(), now)).toMatchObject({ primary: 'start', primaryEnabled: true, canCancel: true }));
  it('shows but disables start before the join window', () => expect(planActionAvailability(plan({ starts_at: '2026-08-21T18:00:00.000Z', ends_at: '2026-08-21T19:00:00.000Z' }), now)).toMatchObject({ primary: 'start', primaryEnabled: false, canCancel: true }));
  it('replaces start with end for an active attended plan', () => expect(planActionAvailability(plan({ status: 'active', source: 'chat', attendance: { user: { id: 'attendance-1', participant_type: 'user', joined_at: now.toISOString(), left_at: null }, character: null } }), now)).toMatchObject({ primary: null, primaryEnabled: false, canEnd: true, canCancel: false }));
  it('does not manually end date-backed plans from the shared-plan controls', () => expect(planActionAvailability(plan({ status: 'active', source: 'date', attendance: { user: { id: 'attendance-1', participant_type: 'user', joined_at: now.toISOString(), left_at: null }, character: null } }), now)).toMatchObject({ primary: null, canEnd: false }));
  it('removes live actions from completed plans', () => expect(planActionAvailability(plan({ status: 'completed' }), now)).toMatchObject({ primary: null, canCancel: false, canEdit: false }));
});

describe('chat plan presentation', () => {
  it('selects only the active plan the user is attending', () => {
    const attended = plan({ id: 'attended', status: 'active', attendance: { user: { id: 'attendance-1', participant_type: 'user', joined_at: now.toISOString(), left_at: null }, character: null } });
    const unattended = plan({ id: 'unattended', status: 'active' });
    expect(activePlanForChat([unattended, attended], 'character-1')?.id).toBe('attended');
  });

  it('does not surface an active plan from another companion', () => {
    const attended = plan({ status: 'active', character_instance_id: 'character-2', attendance: { user: { id: 'attendance-1', participant_type: 'user', joined_at: now.toISOString(), left_at: null }, character: null } });
    expect(activePlanForChat([attended], 'character-1')).toBeNull();
  });

  it('collapses switch completion into the plan changed event', () => {
    expect(shouldShowPlanTimelineEvent({ event_type: 'plan_completed', metadata: { switchedToPlanId: 'plan-2' } })).toBe(false);
    expect(shouldShowPlanTimelineEvent({ event_type: 'plan_switched', metadata: { previousPlanId: 'plan-1' } })).toBe(true);
  });

  it('renders one canonical card across save and repeated start events', () => {
    const events = [
      { id: 'created', entity_id: 'plan-1', entity_type: 'shared_plan', event_type: 'plan_created', created_at: '2026-08-21T16:00:00.000Z', metadata: {} },
      { id: 'joined-1', entity_id: 'plan-1', entity_type: 'shared_plan', event_type: 'plan_joined', created_at: '2026-08-21T16:01:00.000Z', metadata: {} },
      { id: 'joined-2', entity_id: 'plan-1', entity_type: 'shared_plan', event_type: 'plan_joined', created_at: '2026-08-21T16:02:00.000Z', metadata: {} },
    ];
    expect(collapsePlanTimelineEvents(events).map((event) => event.id)).toEqual(['joined-2']);
  });

  it('keeps separate plans and the latest lifecycle state for each', () => {
    const events = [
      { id: 'one-created', entity_id: 'plan-1', entity_type: 'shared_plan', event_type: 'plan_created', created_at: '2026-08-21T16:00:00.000Z', metadata: {} },
      { id: 'two-created', entity_id: 'plan-2', entity_type: 'shared_plan', event_type: 'plan_created', created_at: '2026-08-21T16:01:00.000Z', metadata: {} },
      { id: 'one-completed', entity_id: 'plan-1', entity_type: 'shared_plan', event_type: 'plan_completed', created_at: '2026-08-21T17:00:00.000Z', metadata: {} },
    ];
    expect(collapsePlanTimelineEvents(events).map((event) => event.id)).toEqual(['two-created', 'one-completed']);
  });

  it('hides a location-mention date card when chat is already at that place', () => {
    const action={payload:{trigger:'assistant_location_mention',locationId:'blue-lantern'}};
    expect(shouldShowPlanConversationAction(action,'blue-lantern')).toBe(false);
    expect(shouldShowPlanConversationAction(action,'riverwalk')).toBe(true);
  });
});

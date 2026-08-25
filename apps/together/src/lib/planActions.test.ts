import { describe, expect, it, vi } from 'vitest';
vi.mock('./api', () => ({ invoke: vi.fn() }));
import { activePlanForChat, activePlanForGroup, attendedPlansForLifecycleReconciliation, collapsePlanTimelineEvents, conversationPlanMenuItems, joinablePlanForChat, joinablePlanForGroup, planActionAvailability, planLifecycleDividerLabel, plansForGroup, shouldShowPlanConversationAction, shouldShowPlanTimelineEvent } from './planActions';
import type { Commitment, CommitmentAttendance } from './commitments';

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
  it('replaces plan creation with change and end settings while a plan is active', () => {
    expect(conversationPlanMenuItems(false)).toEqual([{key:'createPlan',label:'Plan something'}]);
    expect(conversationPlanMenuItems(true)).toEqual([
      {key:'continuePlan',label:'Continue plan'},
      {key:'changePlan',label:'Change plan'},
      {key:'endPlan',label:'End plan',danger:true},
    ]);
  });

  it('selects only the active plan the user is attending', () => {
    const attended = plan({ id: 'attended', status: 'active', attendance: { user: { id: 'attendance-1', participant_type: 'user', joined_at: now.toISOString(), left_at: null }, character: null } });
    const unattended = plan({ id: 'unattended', status: 'active' });
    expect(activePlanForChat([unattended, attended], 'character-1')?.id).toBe('attended');
  });

  it('does not surface an active plan from another companion', () => {
    const attended = plan({ status: 'active', character_instance_id: 'character-2', attendance: { user: { id: 'attendance-1', participant_type: 'user', joined_at: now.toISOString(), left_at: null }, character: null } });
    expect(activePlanForChat([attended], 'character-1')).toBeNull();
  });

  it('keeps every attended non-date plan eligible for elapsed lifecycle reconciliation', () => {
    const attendance:{user:CommitmentAttendance;character:null}={user:{id:'attendance-1',participant_type:'user',joined_at:now.toISOString(),left_at:null},character:null};
    const first=plan({id:'first',status:'active',ends_at:'2026-08-21T16:30:00.000Z',attendance});
    const second=plan({id:'second',status:'scheduled',ends_at:'2026-08-21T17:30:00.000Z',attendance});
    const date=plan({id:'date',status:'active',source:'date',attendance});
    const completed=plan({id:'completed',status:'completed',attendance});
    expect(attendedPlansForLifecycleReconciliation([second,date,completed,first],'character-1').map((item)=>item.id)).toEqual(['first','second']);
  });

  it('surfaces a current unattended plan as joinable in chat', () => {
    const current = plan({ id:'join-me', status:'active', starts_at:'2026-08-21T15:30:00.000Z', ends_at:'2026-08-21T17:00:00.000Z' });
    expect(joinablePlanForChat([current], 'character-1', now)?.id).toBe('join-me');
  });

  it('does not surface early, attended, terminal, or another companion plan as joinable', () => {
    const early = plan({ id:'early', starts_at:'2026-08-21T18:00:00.000Z', ends_at:'2026-08-21T19:00:00.000Z' });
    const attended = plan({ id:'attended', status:'active', starts_at:'2026-08-21T15:30:00.000Z', ends_at:'2026-08-21T17:00:00.000Z', attendance:{user:{id:'attendance-1',participant_type:'user',joined_at:now.toISOString(),left_at:null},character:null} });
    const complete = plan({ id:'complete', status:'completed', starts_at:'2026-08-21T15:30:00.000Z', ends_at:'2026-08-21T17:00:00.000Z' });
    const other = plan({ id:'other', character_instance_id:'character-2', status:'active', starts_at:'2026-08-21T15:30:00.000Z', ends_at:'2026-08-21T17:00:00.000Z' });
    expect(joinablePlanForChat([early,attended,complete,other], 'character-1', now)).toBeNull();
  });

  it('scopes group plan actions to the group conversation instead of the anchor companion', () => {
    const attendance:{user:CommitmentAttendance;character:null}={user:{id:'attendance-1',participant_type:'user',joined_at:now.toISOString(),left_at:null},character:null};
    const groupOne=plan({id:'group-one',status:'active',attendance,source_conversation_id:'group-1'} as Partial<Commitment>);
    const groupTwo=plan({id:'group-two',status:'active',attendance,source_conversation_id:'group-2'} as Partial<Commitment>);
    expect(plansForGroup([groupOne,groupTwo] as Array<Commitment&{source_conversation_id?:string|null}>,'group-1').map((item)=>item.id)).toEqual(['group-one']);
    expect(activePlanForGroup([groupOne,groupTwo] as Array<Commitment&{source_conversation_id?:string|null}>,'group-1')?.id).toBe('group-one');
  });

  it('finds a joinable group plan without exposing a plan from another group', () => {
    const joinable=plan({id:'join-group',status:'active',starts_at:'2026-08-21T15:30:00.000Z',ends_at:'2026-08-21T17:00:00.000Z',source_conversation_id:'group-1'} as Partial<Commitment>);
    const other=plan({id:'other-group',status:'active',starts_at:'2026-08-21T15:30:00.000Z',ends_at:'2026-08-21T17:00:00.000Z',source_conversation_id:'group-2'} as Partial<Commitment>);
    expect(joinablePlanForGroup([joinable,other] as Array<Commitment&{source_conversation_id?:string|null}>,'group-1',now)?.id).toBe('join-group');
  });

  it('collapses switch completion into the plan changed event', () => {
    expect(shouldShowPlanTimelineEvent({ event_type: 'plan_completed', metadata: { switchedToPlanId: 'plan-2' } })).toBe(false);
    expect(shouldShowPlanTimelineEvent({ event_type: 'plan_switched', metadata: { previousPlanId: 'plan-1' } })).toBe(true);
  });

  it('keeps one scheduled and one started divider while deduplicating repeated starts', () => {
    const events = [
      { id: 'created', entity_id: 'plan-1', entity_type: 'shared_plan', event_type: 'plan_created', created_at: '2026-08-21T16:00:00.000Z', metadata: { startsAt: '2026-08-21T18:00:00.000Z' } },
      { id: 'joined-1', entity_id: 'plan-1', entity_type: 'shared_plan', event_type: 'plan_joined', created_at: '2026-08-21T16:01:00.000Z', metadata: {} },
      { id: 'joined-2', entity_id: 'plan-1', entity_type: 'shared_plan', event_type: 'plan_joined', created_at: '2026-08-21T16:02:00.000Z', metadata: {} },
    ];
    expect(collapsePlanTimelineEvents(events).map((event) => event.id)).toEqual(['created', 'joined-2']);
  });

  it('keeps scheduled and ended milestones for the same plan', () => {
    const events = [
      { id: 'one-created', entity_id: 'plan-1', entity_type: 'shared_plan', event_type: 'plan_created', created_at: '2026-08-21T16:00:00.000Z', metadata: { startsAt: '2026-08-21T18:00:00.000Z' } },
      { id: 'two-created', entity_id: 'plan-2', entity_type: 'shared_plan', event_type: 'plan_created', created_at: '2026-08-21T16:01:00.000Z', metadata: { startsAt: '2026-08-21T19:00:00.000Z' } },
      { id: 'one-completed', entity_id: 'plan-1', entity_type: 'shared_plan', event_type: 'plan_completed', created_at: '2026-08-21T17:00:00.000Z', metadata: {} },
    ];
    expect(collapsePlanTimelineEvents(events).map((event) => event.id)).toEqual(['one-created', 'two-created', 'one-completed']);
  });

  it('suppresses the scheduled divider for Start Now plans', () => {
    expect(shouldShowPlanTimelineEvent({ event_type: 'plan_created', created_at: '2026-08-21T16:00:00.000Z', metadata: { startsAt: '2026-08-21T16:00:05.000Z', immediate: true } })).toBe(false);
    expect(shouldShowPlanTimelineEvent({ event_type: 'plan_created', created_at: '2026-08-21T16:00:00.000Z', metadata: { startsAt: '2026-08-21T17:00:00.000Z' } })).toBe(true);
  });

  it('uses the companion first name in lifecycle divider copy', () => {
    expect(planLifecycleDividerLabel({ event_type: 'plan_created' }, 'Chloe Mercier')).toBe('Plan scheduled with Chloe');
    expect(planLifecycleDividerLabel({ event_type: 'plan_joined' }, 'Chloe Mercier')).toBe('Plan started with Chloe');
    expect(planLifecycleDividerLabel({ event_type: 'plan_completed' }, 'Chloe Mercier')).toBe('Plan ended with Chloe');
  });

  it('hides a location-mention date card when chat is already at that place', () => {
    const action={candidate_type:'plan_create',payload:{trigger:'assistant_location_mention',locationId:'blue-lantern'}};
    expect(shouldShowPlanConversationAction(action,'blue-lantern')).toBe(false);
    expect(shouldShowPlanConversationAction(action,'riverwalk')).toBe(true);
  });

  it('hides new-plan suggestions while a plan is active without hiding management actions', () => {
    expect(shouldShowPlanConversationAction({candidate_type:'plan_create',payload:{}},null,true)).toBe(false);
    expect(shouldShowPlanConversationAction({candidate_type:'date',payload:{}},null,true)).toBe(false);
    expect(shouldShowPlanConversationAction({candidate_type:'plan_reschedule',payload:{}},null,true)).toBe(true);
    expect(shouldShowPlanConversationAction({candidate_type:'plan_cancel',payload:{}},null,true)).toBe(true);
  });
});

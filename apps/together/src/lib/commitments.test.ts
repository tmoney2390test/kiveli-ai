import { describe, expect, it, vi } from 'vitest';
vi.mock('./api',()=>({invoke:vi.fn()}));
vi.mock('./requestId',()=>({createClientRequestId:()=> 'test-request'}));
import { commitmentStatusLabel, commitmentTemporalState, planCompletionLabel, type Commitment } from './commitments';

const completed = {
  id: 'plan',
  character_instance_id: 'character',
  title: 'Drinks at Velvet Hour',
  activity_key: 'drinks',
  starts_at: '2026-08-17T00:00:00Z',
  ends_at: '2026-08-17T01:30:00Z',
  completed_at: '2026-08-17T01:30:00Z',
  status: 'completed',
  completion_reason: 'elapsed',
} satisfies Commitment;

describe('commitment completion presentation', () => {
  it('presents completed plans as shared history', () => {
    expect(commitmentStatusLabel(completed)).toBe('SHARED');
    expect(planCompletionLabel(completed)).toBe('Ended at the scheduled time');
  });

  it('distinguishes an explicit early ending', () => {
    expect(planCompletionLabel({ ...completed, completed_at: '2026-08-17T01:00:00Z', completion_reason: 'user_ended' })).toBe('You ended the plan early');
  });

  it('marks a plan expired at its exact end boundary', () => {
    const active = { ...completed, status: 'active', completed_at: null, completion_reason: null } satisfies Commitment;
    expect(commitmentTemporalState(active, new Date('2026-08-17T01:29:59Z'))).toBe('active');
    expect(commitmentTemporalState(active, new Date('2026-08-17T01:30:00Z'))).toBe('expired');
  });
});

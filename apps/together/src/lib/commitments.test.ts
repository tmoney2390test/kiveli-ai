import { describe, expect, it, vi } from 'vitest';

vi.mock('./api', () => ({ invoke: vi.fn() }));
import { commitmentTimeLabel, type Commitment } from './commitments';

const plan: Commitment = {
  id: 'plan',
  character_instance_id: 'character',
  title: 'Late dinner',
  activity_key: 'dinner',
  starts_at: '2026-08-15T01:00:00.000Z',
  ends_at: '2026-08-15T02:30:00.000Z',
  world_timezone: 'Asia/Tokyo',
  user_timezone: 'America/New_York',
  status: 'scheduled',
};

describe('commitment clocks', () => {
  it('shows the viewer-local time without a fictional world-time conversion', () => {
    const label = commitmentTimeLabel(plan, 'America/New_York');
    expect(label).toContain('9:00');
    expect(label).not.toContain('10:00');
    expect(label).not.toContain('your time');
  });
});

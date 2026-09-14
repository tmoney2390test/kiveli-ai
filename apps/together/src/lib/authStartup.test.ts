import { describe, expect, it } from 'vitest';
import { createAuthStartupGate } from './authStartup';

describe('auth startup gate', () => {
  const oldSession = { user: 'old' };
  const newSession = { user: 'new' };

  it('uses the validated persisted session when no auth change occurs', () => {
    const gate = createAuthStartupGate<typeof oldSession>();
    expect(gate.onChange('INITIAL_SESSION', oldSession)).toEqual({ ready: false });
    expect(gate.complete(null)).toBeNull();
    expect(gate.onChange('INITIAL_SESSION', oldSession)).toEqual({ ready: false });
  });

  it('preserves a sign-in that arrives during persisted-session validation', () => {
    const gate = createAuthStartupGate<typeof oldSession>();
    gate.onChange('INITIAL_SESSION', oldSession);
    gate.onChange('SIGNED_IN', newSession);
    expect(gate.complete(oldSession)).toBe(newSession);
    expect(gate.onChange('TOKEN_REFRESHED', oldSession)).toEqual({ ready: true, session: oldSession });
  });

  it('preserves a sign-out that arrives during persisted-session validation', () => {
    const gate = createAuthStartupGate<typeof oldSession>();
    gate.onChange('SIGNED_OUT', null);
    expect(gate.complete(oldSession)).toBeNull();
  });
});

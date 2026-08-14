import { describe, expect, it } from 'vitest';
import { authErrorMessage } from './authErrors';

describe('authErrorMessage', () => {
  it('turns invalid credentials into a safe, actionable message', () => {
    expect(authErrorMessage('invalid_credentials', 'fallback')).toBe('That email or password is incorrect.');
  });

  it('explains how an unconfirmed account can recover', () => {
    expect(authErrorMessage('email_not_confirmed', 'fallback')).toContain('resend the confirmation');
  });

  it('preserves unexpected provider messages for diagnosis', () => {
    expect(authErrorMessage('unexpected_code', 'Provider unavailable')).toBe('Provider unavailable');
  });
});

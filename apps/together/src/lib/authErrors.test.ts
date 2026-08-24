import { describe, expect, it } from 'vitest';
import { authErrorMessage } from './authErrors';

describe('authErrorMessage', () => {
  it('turns invalid credentials into a safe, actionable message', () => {
    expect(authErrorMessage('invalid_credentials', 'fallback')).toBe('That email or password is incorrect.');
  });

  it('directs unconfirmed password users to the real ownership-verification flow', () => {
    expect(authErrorMessage('email_not_confirmed', 'fallback')).toContain('confirm your account');
  });

  it('preserves unexpected provider messages for diagnosis', () => {
    expect(authErrorMessage('unexpected_code', 'Provider unavailable')).toBe('Provider unavailable');
  });
});

import { describe, expect, it } from 'vitest';
import { authCallbackErrorMessage, authErrorMessage } from './authErrors';

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

  it('turns a missing PKCE verifier into a safe recovery message', () => {
    expect(authCallbackErrorMessage({
      code: 'flow_state_not_found',
      message: 'PKCE code verifier not found in storage.',
    })).toBe('This sign-in link is no longer connected to this browser. Return to sign in and try again.');
  });

  it('recognizes the provider message even when no stable code is supplied', () => {
    expect(authCallbackErrorMessage(new Error('PKCE code verifier not found in storage.'))).not.toContain('PKCE');
  });
});

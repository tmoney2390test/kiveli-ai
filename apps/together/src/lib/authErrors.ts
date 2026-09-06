const messages: Record<string, string> = {
  email_not_confirmed: 'Check your email for a new sign-in code.',
  email_address_invalid: 'That address could not receive a sign-in code. Check it and try again.',
  invalid_credentials: 'That email or password is incorrect.',
  user_not_found: 'That email or password is incorrect.',
  otp_expired: 'That code is invalid or has expired. Request a new one and try again.',
  over_email_send_rate_limit: 'A code was sent recently. Wait a minute before requesting another.',
  weak_password: 'Use at least eight characters for your password.',
};

export function authErrorMessage(code: string | undefined, fallback: string) {
  return messages[code ?? ''] ?? fallback;
}

export function authCallbackErrorMessage(error: unknown) {
  const candidate = error as { code?: string; message?: string } | null;
  const code = candidate?.code?.trim().toLowerCase() ?? '';
  const message = candidate?.message?.trim() ?? '';
  const normalized = message.toLowerCase();
  if (code === 'flow_state_not_found'
    || normalized.includes('pkce code verifier not found')
    || normalized.includes('code verifier') && normalized.includes('storage')) {
    return 'This sign-in link is no longer connected to this browser. Return to sign in and try again.';
  }
  return authErrorMessage(candidate?.code, message || 'The sign-in confirmation could not be completed.');
}

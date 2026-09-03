const messages: Record<string, string> = {
  email_not_confirmed: 'Check your email and confirm your account before signing in.',
  invalid_credentials: 'That email or password is incorrect.',
  user_not_found: 'That email or password is incorrect.',
  over_email_send_rate_limit: 'Please wait a moment before requesting another email.',
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

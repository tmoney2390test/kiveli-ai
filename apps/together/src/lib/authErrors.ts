const messages: Record<string, string> = {
  email_not_confirmed: 'This account could not be activated automatically. Try signing in once more.',
  invalid_credentials: 'That email or password is incorrect.',
  user_not_found: 'That email or password is incorrect.',
  over_email_send_rate_limit: 'Please wait a moment before requesting another email.',
  weak_password: 'Use at least eight characters for your password.',
};

export function authErrorMessage(code: string | undefined, fallback: string) {
  return messages[code ?? ''] ?? fallback;
}

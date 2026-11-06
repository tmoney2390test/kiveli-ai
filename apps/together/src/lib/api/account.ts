import { supabasePublishableKey, supabaseUrl } from '../supabase';
import { installationIdentity } from '../installationIdentity';
import { ApiError, invoke } from './transport';
export const reportMessage = (messageId: string, reason: string, detail = '') =>
  invoke('together-report', { messageId, reason, detail });
export const manageAccount = <T>(input: Record<string, unknown>) =>
  invoke<T>('together-account', input);
export const managePersona = <T>(input: Record<string, unknown>) =>
  invoke<T>('together-persona', input);
export const manageSubscription = <T>(input?: Record<string, unknown>) =>
  input
    ? invoke<T>('together-subscription', input)
    : invoke<T>('together-subscription', undefined, 'GET');
export async function createTogetherAccount(
  email: string,
  password: string,
  dateOfBirth: string,
): Promise<void> {
  const response = await fetch(`${supabaseUrl}/functions/v1/together-signup`, {
    method: 'POST',
    headers: {
      apikey: supabasePublishableKey,
      Authorization: `Bearer ${supabasePublishableKey}`,
      'Content-Type': 'application/json',
      'x-kivelle-installation-id': await installationIdentity(),
    },
    body: JSON.stringify({ email, password, dateOfBirth }),
  });
  const payload = await response.json().catch(() => ({})) as {
    error?: {
      message?: string;
      code?: string;
      retryable?: boolean;
    };
  };
  if (!response.ok) {
    throw new ApiError(
      payload.error?.message ?? 'Your Kivelle account could not be created.',
      payload.error?.code,
      payload.error?.retryable,
    );
  }
}

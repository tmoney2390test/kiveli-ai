import { confirmScenarioEventTransition } from '../scenarioEventTransition';
import { supabase, supabasePublishableKey, supabaseUrl } from '../supabase';
import { clearSessionForApiFailure } from '../authSession';
import { ensureAiConsent, invalidateAiConsent, needsClientAiConsentCheck } from '../aiConsent';
import { performanceSurfaces, queueClientPerformance } from './telemetry';
import { nativePlatformHeaders } from './clientPlatform';
export class ApiError extends Error {
  constructor(
    message: string,
    readonly code = 'UNKNOWN',
    readonly retryable = false,
    readonly correlationId?: string,
  ) {
    super(message);
    if (code === 'CONSENT_REQUIRED') {
      invalidateAiConsent();
    }
  }
}
export type Envelope<T> = {
  data: T;
  correlationId: string;
};
export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
let recentAccessToken: {
  value: string;
  expiresAt: number;
} | null = null;
export async function token(): Promise<string> {
  if (recentAccessToken && recentAccessToken.expiresAt > Date.now()) {
    return recentAccessToken.value;
  }
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    recentAccessToken = null;
    throw new ApiError('Sign in to continue.', 'AUTH_REQUIRED');
  }
  const expiresAt = Math.min(
    Number(data.session.expires_at ?? 0) * 1000 - 30000,
    Date.now() + 5000,
  );
  recentAccessToken = { value: data.session.access_token, expiresAt };
  return data.session.access_token;
}
async function requireFeatureConsent(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    throw new ApiError('Sign in to continue.', 'AUTH_REQUIRED');
  }
  if (!await ensureAiConsent(data.session.user.id)) {
    throw new ApiError(
      'AI sharing is required for this feature. You can change your choice in Privacy settings.',
      'CONSENT_REQUIRED',
    );
  }
}
export async function invoke<T>(
  name: string,
  body?: unknown,
  method: 'GET' | 'POST' = 'POST',
  options: {
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  if (needsClientAiConsentCheck(name, body)) {
    await requireFeatureConsent();
  }
  const started = Date.now(),
    surface = name.split('?')[0]!,
    operation = typeof body === 'object' && body && 'action' in body
      ? String((body as Record<string, unknown>).action)
      : method.toLowerCase();
  let response: Response | undefined;
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
      method,
      headers: {
        Authorization: `Bearer ${await token()}`,
        apikey: supabasePublishableKey,
        'Content-Type': 'application/json',
        'x-kivelle-timezone': deviceTimezone(),
        ...nativePlatformHeaders(),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(options.signal ? { signal: options.signal } : {}),
    });
    const payload = await response.json().catch(() => ({})) as Envelope<T> & {
      error?: {
        message?: string;
        code?: string;
        retryable?: boolean;
        correlationId?: string;
      };
    };
    if (!response.ok) {
      if (
        payload.error?.code === 'SCENARIO_PAUSE_REQUIRED' && body && typeof body === 'object' &&
        'action' in body &&
        ((name === 'together-plan' && body.action === 'join') ||
          (name === 'together-date' && body.action === 'start')) &&
        !('pauseScenario' in body && body.pauseScenario === true)
      ) {
        if (await confirmScenarioEventTransition()) {
          return invoke<T>(name, { ...body, pauseScenario: true }, method, options);
        }
        throw new ApiError('Your scenario is still running.', 'SCENARIO_CONTINUED');
      }
      await clearSessionForApiFailure(supabase.auth, response.status, payload.error?.code);
      throw new ApiError(
        payload.error?.message ?? 'Something went wrong.',
        payload.error?.code,
        payload.error?.retryable ??
          (response.status === 408 || response.status === 429 || response.status >= 500),
        payload.error?.correlationId ?? payload.correlationId,
      );
    }
    return payload.data;
  } finally {
    if (performanceSurfaces.has(surface)) {
      queueClientPerformance({
        surface,
        operation,
        durationMs: Date.now() - started,
        success: Boolean(response?.ok),
        ...(response ? { statusCode: response.status } : {}),
        metadata: { method },
      });
    }
  }
}

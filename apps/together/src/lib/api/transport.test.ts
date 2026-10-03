import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  consent: vi.fn(),
  needsConsent: vi.fn(),
  invalidate: vi.fn(),
  clearSession: vi.fn(),
  confirmTransition: vi.fn(),
  telemetry: vi.fn(),
}));
vi.mock('../supabase', () => ({
  supabase: { auth: { getSession: mocks.getSession } },
  supabaseUrl: 'https://test.example',
  supabasePublishableKey: 'public-test-key',
}));
vi.mock('../aiConsent', () => ({
  ensureAiConsent: mocks.consent,
  needsClientAiConsentCheck: mocks.needsConsent,
  invalidateAiConsent: mocks.invalidate,
}));
vi.mock('../authSession', () => ({ clearSessionForApiFailure: mocks.clearSession }));
vi.mock(
  '../scenarioEventTransition',
  () => ({ confirmScenarioEventTransition: mocks.confirmTransition }),
);
vi.mock('./telemetry', () => ({
  performanceSurfaces: new Set(['together-plan', 'together-bootstrap']),
  queueClientPerformance: mocks.telemetry,
}));

const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  mocks.getSession.mockResolvedValue({
    data: {
      session: {
        access_token: 'test-token',
        expires_at: Date.now() / 1000 + 3600,
        user: { id: 'owner' },
      },
    },
  });
  mocks.needsConsent.mockReturnValue(false);
  mocks.consent.mockResolvedValue(true);
});
afterEach(() => vi.unstubAllGlobals());

describe('shared API transport', () => {
  it('preserves authenticated GET requests, cancellation and envelope results', async () => {
    const { invoke } = await import('./transport');
    const controller = new AbortController();
    fetchMock.mockResolvedValue(response({ data: { ready: true }, correlationId: 'trace' }));
    await expect(invoke('together-bootstrap', undefined, 'GET', { signal: controller.signal }))
      .resolves.toEqual({ ready: true });
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://test.example/functions/v1/together-bootstrap');
    expect(options).toMatchObject({
      method: 'GET',
      signal: controller.signal,
      headers: { Authorization: 'Bearer test-token', apikey: 'public-test-key' },
    });
    expect(options).not.toHaveProperty('body');
    expect(mocks.telemetry).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('rejects signed-out requests before dispatch', async () => {
    const { invoke } = await import('./transport');
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    await expect(invoke('together-bootstrap')).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retains consent checks and invalidation before generation', async () => {
    const { invoke } = await import('./transport');
    mocks.needsConsent.mockReturnValue(true);
    mocks.consent.mockResolvedValue(false);
    await expect(invoke('together-media', { action: 'generate' }))
      .rejects.toMatchObject({ code: 'CONSENT_REQUIRED' });
    expect(mocks.consent).toHaveBeenCalledWith('owner');
    expect(mocks.invalidate).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retains retryability, correlation IDs and session recovery without blindly retrying writes', async () => {
    const { invoke } = await import('./transport');
    fetchMock.mockResolvedValue(
      response({ error: { code: 'BUSY', message: 'Try again' }, correlationId: 'trace-1' }, 429),
    );
    await expect(invoke('together-plan', { action: 'create', requestId: 'same-id' }))
      .rejects.toMatchObject({ code: 'BUSY', retryable: true, correlationId: 'trace-1' });
    expect(mocks.clearSession).toHaveBeenCalledWith(expect.anything(), 429, 'BUSY');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('reuses the action and request ID when an approved scenario transition requires a second request', async () => {
    const { invoke } = await import('./transport');
    const input = { action: 'join', planId: 'plan', requestId: 'request' };
    fetchMock.mockResolvedValueOnce(response({ error: { code: 'SCENARIO_PAUSE_REQUIRED' } }, 409))
      .mockResolvedValueOnce(response({ data: { joined: true } }));
    mocks.confirmTransition.mockResolvedValue(true);
    await expect(invoke('together-plan', input)).resolves.toEqual({ joined: true });
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]!.body)))
      .toEqual({ ...input, pauseScenario: true });
    expect(input).not.toHaveProperty('pauseScenario');
  });

  it('does not retry or pause a scenario when the user declines', async () => {
    const { invoke } = await import('./transport');
    fetchMock.mockResolvedValue(response({ error: { code: 'SCENARIO_PAUSE_REQUIRED' } }, 409));
    mocks.confirmTransition.mockResolvedValue(false);
    await expect(invoke('together-plan', { action: 'join' }))
      .rejects.toMatchObject({ code: 'SCENARIO_CONTINUED' });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('propagates abort failures without retrying the request', async () => {
    const { invoke } = await import('./transport');
    const failure = new DOMException('Cancelled', 'AbortError');
    fetchMock.mockRejectedValue(failure);
    await expect(invoke('together-plan', { action: 'create' })).rejects.toBe(failure);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

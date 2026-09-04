import { assertEquals } from 'jsr:@std/assert@1';
import { AppError } from './types.ts';
import {
  finalizeMediaWithRetry,
  isRetryableMediaFinalizationError,
  mediaFinalizationFailure,
  mediaSubmissionRetryDelayMs,
  providerJobTimeoutStartedAt,
} from './together-media-dispatcher.ts';

Deno.test('media finalization retries one transient failure and then succeeds', async () => {
  let attempts = 0;
  let terminalFailures = 0;
  const result = await finalizeMediaWithRetry({
    finalize: () => {
      attempts += 1;
      if (attempts === 1) throw new AppError('INTERNAL_ERROR', 'storage unavailable', 500, true);
      return Promise.resolve('ready');
    },
    onTerminalFailure: () => {
      terminalFailures += 1;
      return Promise.resolve();
    },
    wait: () => Promise.resolve(),
  });

  assertEquals(result, { status: 'finalized', value: 'ready', attempts: 2 });
  assertEquals(terminalFailures, 0);
});

Deno.test('media finalization gives repeated transient failures three delivery attempts', async () => {
  let attempts = 0;
  let terminalFailures = 0;
  const result = await finalizeMediaWithRetry({
    finalize: () => {
      attempts += 1;
      return Promise.reject(new AppError('PROVIDER_TIMEOUT', 'download timed out', 503, true));
    },
    onTerminalFailure: () => {
      terminalFailures += 1;
      return Promise.resolve();
    },
    wait: () => Promise.resolve(),
  });

  assertEquals(result.status, 'failed');
  assertEquals(attempts, 3);
  assertEquals(terminalFailures, 1);
});

Deno.test('invalid provider output fails immediately without a blind retry', async () => {
  let attempts = 0;
  const error = new AppError('PROVIDER_REQUEST_INVALID', 'Unsupported image format.', 422, false);
  const result = await finalizeMediaWithRetry({
    finalize: () => {
      attempts += 1;
      return Promise.reject(error);
    },
    onTerminalFailure: () => Promise.resolve(),
    wait: () => Promise.resolve(),
  });

  assertEquals(result.status, 'failed');
  assertEquals(attempts, 1);
  assertEquals(isRetryableMediaFinalizationError(error), false);
  assertEquals(mediaFinalizationFailure(error), { code: 'PROVIDER_REQUEST_INVALID', reason: 'Unsupported image format.' });
});

Deno.test('provider throttling is deferred with bounded backoff before terminal failure', () => {
  const throttled = new AppError('RATE_LIMITED', 'Provider is busy.', 429, true);
  assertEquals(mediaSubmissionRetryDelayMs(throttled, 1), 15_000);
  assertEquals(mediaSubmissionRetryDelayMs(throttled, 2), 45_000);
  assertEquals(mediaSubmissionRetryDelayMs(throttled, 3), null);
});

Deno.test('unknown submissions and invalid requests are never submitted twice', () => {
  assertEquals(
    mediaSubmissionRetryDelayMs(new AppError('PROVIDER_SUBMISSION_UNKNOWN', 'Submission outcome is unknown.', 503, false), 1),
    null,
  );
  assertEquals(
    mediaSubmissionRetryDelayMs(new AppError('PROVIDER_REQUEST_INVALID', 'Invalid request.', 422, false), 1),
    null,
  );
});

Deno.test('quality recovery uses its fresh recovery time without rewriting provider history', () => {
  assertEquals(
    providerJobTimeoutStartedAt({
      created_at: '2026-09-03T20:00:00.000Z',
      provider_metadata: { qualityRecoveryRequestedAt: '2026-09-03T21:00:00.000Z' },
    }),
    Date.parse('2026-09-03T21:00:00.000Z'),
  );
  assertEquals(
    providerJobTimeoutStartedAt({ created_at: '2026-09-03T20:00:00.000Z' }),
    Date.parse('2026-09-03T20:00:00.000Z'),
  );
});

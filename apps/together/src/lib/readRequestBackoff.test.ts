import { describe, expect, it } from 'vitest';
import { parseRetryAfter, ReadRequestBackoff } from './readRequestBackoff';

describe('automatic read backoff', () => {
  it('stops every automatic trigger after a non-retryable validation failure until an explicit successful retry', () => {
    const gate = new ReadRequestBackoff();
    gate.failed({ code: 'VALIDATION_FAILED', retryable: false }, 0);
    for (let trigger = 0; trigger < 156; trigger++) expect(gate.canRequest(false, trigger * 1000)).toBe(false);
    expect(gate.canRequest(true, 0)).toBe(true);
    gate.succeeded();
    expect(gate.canRequest(false, 0)).toBe(true);
  });

  it('honors rate-limit cooldowns for both manual and automatic reads', () => {
    const gate = new ReadRequestBackoff();
    gate.failed({ status: 429, retryable: false, retryAfterMs: 120_000 }, 100);
    expect(gate.canRequest(true, 120_099)).toBe(false);
    expect(gate.canRequest(false, 120_100)).toBe(true);
  });

  it('backs off network failures exponentially and resets after recovery', () => {
    const gate = new ReadRequestBackoff();
    gate.failed(new TypeError('Failed to fetch'), 0);
    expect(gate.canRequest(false, 1999)).toBe(false);
    expect(gate.canRequest(false, 2000)).toBe(true);
    gate.failed({ retryable: true }, 2000);
    expect(gate.canRequest(false, 5999)).toBe(false);
    gate.succeeded();
    gate.failed({ retryable: true }, 6000);
    expect(gate.canRequest(false, 8000)).toBe(true);
  });

  it('parses both Retry-After formats without accepting malformed values', () => {
    expect(parseRetryAfter('120', 0)).toBe(120_000);
    expect(parseRetryAfter('Thu, 01 Jan 1970 00:02:00 GMT', 1000)).toBe(119_000);
    expect(parseRetryAfter('bad', 0)).toBeUndefined();
    expect(parseRetryAfter(null)).toBeUndefined();
  });
});

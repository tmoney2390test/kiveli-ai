import { describe, expect, it } from 'vitest';
import { createClientRequestId } from './requestId';

describe('createClientRequestId', () => {
  it('creates UUID-v4 identifiers without requiring crypto.randomUUID', () => {
    const id = createClientRequestId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('does not reuse identifiers across consecutive requests', () => {
    const ids = Array.from({ length: 100 }, () => createClientRequestId());
    expect(new Set(ids).size).toBe(ids.length);
  });
});

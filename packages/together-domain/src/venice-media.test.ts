import { describe, expect, it } from 'vitest';
import {
  buildVeniceEditRequest,
  parseVeniceSafetyHeaders,
  resolveVenicePipeline,
  VENICE_ADULT_EDIT_MODEL,
  VENICE_STANDARD_EDIT_MODEL,
  veniceModelCostUsd,
} from './venice-media.ts';

describe('Venice media contracts', () => {
  it('uses the single-edit wire contract for one canonical reference', () => {
    const request = buildVeniceEditRequest({ model: VENICE_STANDARD_EDIT_MODEL, prompt: 'Preserve her identity.', images: ['https://signed.test/character.jpg'], aspectRatio: '4:5', safeMode: true });
    expect(request.endpoint).toBe('/image/edit');
    expect(request.body).toMatchObject({ model: VENICE_STANDARD_EDIT_MODEL, image: 'https://signed.test/character.jpg', aspect_ratio: '4:5', safe_mode: true });
  });

  it('uses modelId and capped references for multi-edit', () => {
    const request = buildVeniceEditRequest({ model: VENICE_STANDARD_EDIT_MODEL, prompt: 'Use the real gallery.', images: ['identity', 'location', 'outfit', 'ignored'], aspectRatio: '16:9', safeMode: true });
    expect(request.endpoint).toBe('/image/multi-edit');
    expect(request.body).toMatchObject({ modelId: VENICE_STANDARD_EDIT_MODEL, images: ['identity', 'location', 'outfit'], safe_mode: true });
    expect(request.body).not.toHaveProperty('model');
  });

  it('builds a bounded two-stage pipeline only for approved adult levels', () => {
    expect(resolveVenicePipeline({ contentLevel: 'standard' })).toEqual([{ kind: 'final_edit', model: VENICE_STANDARD_EDIT_MODEL, safeMode: true, estimatedCostUsd: .04 }]);
    expect(resolveVenicePipeline({ contentLevel: 'explicit' })).toEqual([
      { kind: 'canonical_base', model: VENICE_STANDARD_EDIT_MODEL, safeMode: true, estimatedCostUsd: .04 },
      { kind: 'final_edit', model: VENICE_ADULT_EDIT_MODEL, safeMode: false, estimatedCostUsd: .04 },
    ]);
  });

  it('parses moderation headers without persisting private response content', () => {
    const values = new Map([['x-venice-is-blurred', 'false'], ['x-venice-is-content-violation', 'true'], ['cf-ray', 'request-123'], ['x-venice-balance-usd', '8.42']]);
    expect(parseVeniceSafetyHeaders({ get: (name) => values.get(name) ?? null })).toEqual({ blurred: false, contentViolation: true, adultModelContentViolation: false, requestId: 'request-123', balanceUsd: 8.42 });
  });

  it('keeps provider prices centralized and explicit estimates', () => {
    expect(veniceModelCostUsd('qwen-edit')).toBe(.04);
    expect(veniceModelCostUsd('grok-imagine-quality-edit')).toBe(.10);
  });
});

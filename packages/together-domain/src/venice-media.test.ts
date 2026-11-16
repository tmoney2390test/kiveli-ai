import { describe, expect, it } from 'vitest';
import {
  buildVeniceEditRequest,
  parseVeniceSafetyHeaders,
  resolveVenicePipeline,
  VENICE_ADULT_EDIT_MODEL,
  VENICE_ADULT_FINAL_EDIT_MODEL,
  VENICE_QUALITY_EDIT_MODEL,
  VENICE_STANDARD_EDIT_MODEL,
  VENICE_STANDARD_FALLBACK_EDIT_MODEL,
  veniceModelCostUsd,
} from './venice-media.ts';

describe('Venice media contracts', () => {
  it.each([true, false])('retains location references despite a compact preference (safeMode=%s)', (safeMode) => {
    const request = buildVeniceEditRequest({ model: VENICE_STANDARD_EDIT_MODEL, prompt: 'A portrait at the selected place.', images: ['identity', 'location'], referenceRoles: ['character_identity', 'location_environment'], aspectRatio: '4:5', safeMode, compactSingleEdit: true });
    expect(request.endpoint).toBe('/image/multi-edit');
    expect(request.body).toMatchObject({ modelId: VENICE_STANDARD_EDIT_MODEL, images: ['identity', 'location'], safe_mode: safeMode });
    expect(request.body['prompt']).toContain('Image 2: target location and background');
    expect(request.body).not.toHaveProperty('image');
  });

  it('keeps reference labels aligned after removing empty images and enforcing the reference limit', () => {
    const request = buildVeniceEditRequest({ model: VENICE_STANDARD_EDIT_MODEL, prompt: 'A portrait.', images: ['', 'identity', 'location', 'outfit', 'world'], referenceRoles: ['previous_media', 'character_identity', 'location_environment', 'outfit_continuity', 'world_environment'], aspectRatio: '4:5', safeMode: true });
    expect(request.body['images']).toEqual(['identity', 'location', 'outfit']);
    expect(request.body['prompt']).toContain('Image 1: character identity only');
    expect(request.body['prompt']).toContain('Image 2: target location and background');
    expect(request.body['prompt']).not.toContain('Image 4');
  });

  it('uses the documented multi-edit wire contract for the SFW model with one canonical reference', () => {
    const request = buildVeniceEditRequest({ model: VENICE_STANDARD_EDIT_MODEL, prompt: 'Preserve her identity.', images: ['https://signed.test/character.jpg'], aspectRatio: '4:5', safeMode: true });
    expect(request.endpoint).toBe('/image/multi-edit');
    expect(request.body).toMatchObject({ modelId: VENICE_STANDARD_EDIT_MODEL, images: ['https://signed.test/character.jpg'], safe_mode: true });
    expect(request.body).not.toHaveProperty('aspect_ratio');
    expect(request.body).not.toHaveProperty('model');
    expect(request.body).not.toHaveProperty('resolution');
    expect(request.body).not.toHaveProperty('output_format');
  });

  it('keeps single-edit models on the compact single-image contract', () => {
    const request = buildVeniceEditRequest({ model: 'qwen-edit', prompt: 'Preserve her identity.', images: ['https://signed.test/character.jpg'], aspectRatio: '4:5', safeMode: true });
    expect(request.endpoint).toBe('/image/edit');
    expect(request.body).toMatchObject({ model: 'qwen-edit', image: 'https://signed.test/character.jpg' });
    expect(request.body).not.toHaveProperty('safe_mode');
  });

  it('uses modelId and capped references for multi-edit', () => {
    const request = buildVeniceEditRequest({ model: VENICE_STANDARD_EDIT_MODEL, prompt: 'Use the real gallery.', images: ['identity', 'location', 'outfit', 'ignored'], aspectRatio: '16:9', safeMode: true, includeAspectRatio: true });
    expect(request.endpoint).toBe('/image/multi-edit');
    expect(request.body).toMatchObject({ modelId: VENICE_STANDARD_EDIT_MODEL, images: ['identity', 'location', 'outfit'], safe_mode: true, aspect_ratio: '16:9' });
    expect(request.body).not.toHaveProperty('model');
  });

  it('sends uncensored adult identity edits on the compact /image/edit contract', () => {
    const request = buildVeniceEditRequest({ model: VENICE_ADULT_FINAL_EDIT_MODEL, prompt: 'Create a NEW photograph.', images: ['https://signed.test/character.jpg'], aspectRatio: '4:5', safeMode: false, compactSingleEdit: true });
    expect(request.endpoint).toBe('/image/edit');
    expect(request.body).toEqual({ prompt: 'Create a NEW photograph.', model: VENICE_ADULT_FINAL_EDIT_MODEL, image: 'https://signed.test/character.jpg', safe_mode: false });
  });

  it('can force a one-image adult stage through multi-edit so safe mode is explicit', () => {
    const request = buildVeniceEditRequest({ model: VENICE_ADULT_EDIT_MODEL, prompt: 'Apply the approved edit.', images: ['base64-image'], aspectRatio: '4:5', safeMode: false, forceMultiEdit: true });
    expect(request.endpoint).toBe('/image/multi-edit');
    expect(request.body).toMatchObject({ modelId: VENICE_ADULT_EDIT_MODEL, images: ['base64-image'], safe_mode: false });
  });

  it('builds a bounded two-stage pipeline only for approved adult levels', () => {
    expect(resolveVenicePipeline({ contentLevel: 'standard' })).toEqual([{ kind: 'final_edit', model: VENICE_STANDARD_EDIT_MODEL, safeMode: true, estimatedCostUsd: .05 }]);
    expect(resolveVenicePipeline({ contentLevel: 'explicit' })).toEqual([
      { kind: 'canonical_base', model: VENICE_ADULT_EDIT_MODEL, safeMode: false, estimatedCostUsd: .04 },
      { kind: 'final_edit', model: VENICE_ADULT_FINAL_EDIT_MODEL, safeMode: false, estimatedCostUsd: .05 },
    ]);
  });

  it('parses moderation headers without persisting private response content', () => {
    const values = new Map([['x-venice-is-blurred', 'false'], ['x-venice-is-content-violation', 'true'], ['cf-ray', 'request-123'], ['x-venice-balance-usd', '8.42']]);
    expect(parseVeniceSafetyHeaders({ get: (name) => values.get(name) ?? null })).toEqual({ blurred: false, contentViolation: true, adultModelContentViolation: false, requestId: 'request-123', balanceUsd: 8.42 });
  });

  it('keeps provider prices centralized and explicit estimates', () => {
    expect(veniceModelCostUsd('qwen-edit')).toBe(.04);
    expect(veniceModelCostUsd('qwen-edit-uncensored')).toBe(.04);
    expect(veniceModelCostUsd(VENICE_ADULT_FINAL_EDIT_MODEL)).toBe(.05);
    expect(veniceModelCostUsd(VENICE_STANDARD_EDIT_MODEL)).toBe(.05);
    expect(veniceModelCostUsd(VENICE_STANDARD_FALLBACK_EDIT_MODEL)).toBe(.05);
    expect(veniceModelCostUsd('qwen-image-3-edit')).toBe(.04345);
    expect(veniceModelCostUsd('firered-image-edit')).toBe(.04);
    expect(veniceModelCostUsd(VENICE_QUALITY_EDIT_MODEL)).toBe(.05);
  });
});

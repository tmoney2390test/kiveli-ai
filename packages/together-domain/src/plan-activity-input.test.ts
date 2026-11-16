import { describe, expect, it } from 'vitest';
import { parsePlanActivity } from './plan-activity-input';

describe('plan activity input', () => {
  it('retains authored keys used by event schedules and existing plans', () => {
    expect(parsePlanActivity('Have coffee', ['Have coffee'])).toEqual({ key: 'have_coffee', label: 'have coffee', custom: false });
    expect(parsePlanActivity('pub_quiz', ['Pub quiz'])).toEqual({ key: 'pub_quiz', label: 'pub quiz', custom: false });
  });
  it('accepts custom wording without adding it to the catalog', () => {
    const authored = ['Make tea'];
    expect(parsePlanActivity('  Cook\n crêpes & listen to jazz! ', authored)).toEqual({ key: 'Cook crêpes & listen to jazz!', label: 'Cook crêpes & listen to jazz!', custom: true });
    expect(authored).toEqual(['Make tea']);
  });
  it('supports a place with no suggestions and non-English custom activities', () => {
    expect(parsePlanActivity('一起做饭', ['散步'])).toEqual({ key: '一起做饭', label: '一起做饭', custom: true });
    expect(parsePlanActivity('Build a model ship')?.custom).toBe(true);
  });
  it('rejects empty and oversized activities at the same boundary as the API', () => {
    expect(parsePlanActivity(' \n ')).toBeNull();
    expect(parsePlanActivity('x'.repeat(121))).toBeNull();
    expect(parsePlanActivity('x'.repeat(120))?.key).toHaveLength(120);
  });
});

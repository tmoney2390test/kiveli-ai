import { describe, expect, it } from 'vitest';
import type { Relationship } from '../types';
import { relationshipDaysKnown } from './companionLife';

describe('relationshipDaysKnown', () => {
  it('uses canonical interaction days instead of elapsed calendar time', () => {
    expect(relationshipDaysKnown({ days_known: 3 } as Relationship)).toBe(3);
  });

  it('starts a new or reset relationship on day one', () => {
    expect(relationshipDaysKnown(undefined)).toBe(1);
    expect(relationshipDaysKnown({ days_known: 0 } as Relationship)).toBe(1);
  });
});

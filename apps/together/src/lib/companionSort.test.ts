import { describe, expect, it } from 'vitest';
import { nextAgeSort, nextSpiceSort, sortCompanionResults } from './companionSort';

const companions = [
  { name: 'Authored first', age: 31, spiceLevel: 2 },
  { name: 'Young and spicy', age: 22, spiceLevel: 3 },
  { name: 'Older and mild', age: 44, spiceLevel: 1 },
  { name: 'Same spice', age: 27, spiceLevel: 2 },
];

describe('companion discovery sorting', () => {
  it('preserves authored order by default', () => {
    expect(sortCompanionResults(companions, 'recommended', (item) => item).map((item) => item.name)).toEqual(companions.map((item) => item.name));
  });

  it('sorts Spice in both directions and keeps ties stable', () => {
    expect(sortCompanionResults(companions, 'spice-desc', (item) => item).map((item) => item.name)).toEqual(['Young and spicy', 'Authored first', 'Same spice', 'Older and mild']);
    expect(sortCompanionResults(companions, 'spice-asc', (item) => item).map((item) => item.name)).toEqual(['Older and mild', 'Authored first', 'Same spice', 'Young and spicy']);
  });

  it('sorts age in both directions', () => {
    expect(sortCompanionResults(companions, 'age-asc', (item) => item).map((item) => item.age)).toEqual([22, 27, 31, 44]);
    expect(sortCompanionResults(companions, 'age-desc', (item) => item).map((item) => item.age)).toEqual([44, 31, 27, 22]);
  });

  it('puts missing values last and toggles each active sort direction', () => {
    const withMissing = [...companions, { name: 'Unknown', age: null, spiceLevel: null }];
    expect(sortCompanionResults(withMissing, 'age-desc', (item) => item).at(-1)?.name).toBe('Unknown');
    expect(nextSpiceSort('recommended')).toBe('spice-desc');
    expect(nextSpiceSort('spice-desc')).toBe('spice-asc');
    expect(nextAgeSort('recommended')).toBe('age-asc');
    expect(nextAgeSort('age-asc')).toBe('age-desc');
  });
});

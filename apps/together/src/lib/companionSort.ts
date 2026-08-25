export type CompanionSortMode = 'recommended' | 'spice-desc' | 'spice-asc' | 'age-asc' | 'age-desc';

type SortValues = {
  age?: number | null;
  spiceLevel?: number | null;
};

function finiteValue(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function sortCompanionResults<T>(items: readonly T[], mode: CompanionSortMode, values: (item: T) => SortValues): T[] {
  if (mode === 'recommended') return [...items];

  return items
    .map((item, index) => ({ item, index, values: values(item) }))
    .sort((left, right) => {
      const field = mode.startsWith('spice') ? 'spiceLevel' : 'age';
      const leftValue = finiteValue(left.values[field]);
      const rightValue = finiteValue(right.values[field]);
      if (leftValue === null && rightValue === null) return left.index - right.index;
      if (leftValue === null) return 1;
      if (rightValue === null) return -1;
      const direction = mode.endsWith('asc') ? 1 : -1;
      return (leftValue - rightValue) * direction || left.index - right.index;
    })
    .map(({ item }) => item);
}

export function nextSpiceSort(mode: CompanionSortMode): CompanionSortMode {
  return mode === 'spice-desc' ? 'spice-asc' : 'spice-desc';
}

export function nextAgeSort(mode: CompanionSortMode): CompanionSortMode {
  return mode === 'age-asc' ? 'age-desc' : 'age-asc';
}

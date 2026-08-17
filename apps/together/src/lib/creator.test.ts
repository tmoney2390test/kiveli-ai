import { describe, expect, it } from 'vitest';
import { creatorSampleMessages } from './creator';

describe('creatorSampleMessages', () => {
  it('reflects the selected communication tendencies without inventing canonical history', () => {
    const samples = creatorSampleMessages({ name: 'Sofia', warmth: 0.8, humor: 0.8, directness: 0.8 });
    expect(samples).toHaveLength(3);
    expect(samples.every((sample) => sample.startsWith('Sofia:'))).toBe(true);
    expect(samples.join(' ')).not.toMatch(/remember|last time|you told me/i);
  });

  it('keeps concise previews concise', () => {
    expect(creatorSampleMessages({ name: 'Nora', warmth: 0.5, humor: 0.5, directness: 0.5, messageLength: 'concise' })).toHaveLength(2);
  });
});

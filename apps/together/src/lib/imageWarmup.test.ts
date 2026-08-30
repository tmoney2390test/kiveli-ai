import { describe, expect, it } from 'vitest';
import { uniqueHttpsImageUris } from './imageWarmup';

describe('image warmup', () => {
  it('keeps only unique secure image URLs within the visible budget', () => {
    expect(uniqueHttpsImageUris(['http://unsafe.test/a.jpg', 'https://safe.test/a.jpg', 'https://safe.test/a.jpg', null, 'https://safe.test/b.jpg'], 2)).toEqual(['https://safe.test/a.jpg', 'https://safe.test/b.jpg']);
  });
});

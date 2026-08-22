import { describe, expect, it } from 'vitest';
import { cycleProfilePhotoIndex } from './profilePhotoCarousel';

describe('cycleProfilePhotoIndex', () => {
  it('advances and wraps forward through a gallery', () => {
    expect(cycleProfilePhotoIndex(0, 1, 4)).toBe(1);
    expect(cycleProfilePhotoIndex(3, 1, 4)).toBe(0);
  });

  it('moves and wraps backward through a gallery', () => {
    expect(cycleProfilePhotoIndex(3, -1, 4)).toBe(2);
    expect(cycleProfilePhotoIndex(0, -1, 4)).toBe(3);
  });

  it('stays on the only photo and handles an empty gallery', () => {
    expect(cycleProfilePhotoIndex(0, 1, 1)).toBe(0);
    expect(cycleProfilePhotoIndex(2, 1, 0)).toBe(0);
  });
});

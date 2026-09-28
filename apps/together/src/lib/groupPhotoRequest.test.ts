import { describe, expect, it } from 'vitest';
import { classifyPhotoIntent } from '@together/domain/src/media';
import { groupPhotoRequestText } from './groupPhotoRequest';

describe('group photo requests', () => {
  it('addresses the chosen subjects and remains a photo request', () => {
    const request = groupPhotoRequestText(['Sora', 'Lena'], false);
    expect(request).toContain('Sora and Lena');
    expect(request).toContain('photo of you together');
    expect(classifyPhotoIntent(request)).toMatchObject({ requested: true });
  });

  it('routes the one-tap spicy request as explicit', () => {
    const request = groupPhotoRequestText(['Sora', 'Lena'], true);
    expect(classifyPhotoIntent(request)).toMatchObject({ requested: true, requestedContentLevel: 'explicit' });
  });

  it('leaves custom prompt content in the user’s control', () => {
    const request = groupPhotoRequestText(['Sora'], true, 'reading by the window');
    expect(request).toBe('Sora, send me a photo showing exactly this: reading by the window');
    expect(classifyPhotoIntent(request)).toMatchObject({ requested: true });
    expect(classifyPhotoIntent(request).requestedContentLevel).toBeUndefined();
    expect(classifyPhotoIntent(groupPhotoRequestText(['Sora', 'Lena'], false, 'an explicit nude photo together')).requestedContentLevel).toBe('explicit');
  });

  it('requires a selected subject', () => {
    expect(groupPhotoRequestText([], false)).toBe('');
  });
});

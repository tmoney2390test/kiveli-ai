import { describe, expect, it } from 'vitest';
import { mergeProfileGalleryMedia } from './profileGallery';

describe('profile gallery pagination', () => {
  it('keeps newer pages ahead of an older highlighted item and refreshes duplicate URLs', () => {
    const first = [
      { id: 'new', created_at: '2026-09-12T12:00:00Z', url: 'new-url' },
      { id: 'pinned-old', created_at: '2026-09-01T12:00:00Z', url: 'old-url' },
    ];
    const second = [
      { id: 'middle', created_at: '2026-09-08T12:00:00Z', url: 'middle-url' },
      { id: 'pinned-old', created_at: '2026-09-01T12:00:00Z', url: 'refreshed-url' },
    ];

    expect(mergeProfileGalleryMedia(first, second).map((item) => [item.id, item.url])).toEqual([
      ['new', 'new-url'],
      ['middle', 'middle-url'],
      ['pinned-old', 'refreshed-url'],
    ]);
  });
});

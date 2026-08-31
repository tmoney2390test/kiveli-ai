import { describe, expect, it } from 'vitest';
import type { Snapshot } from '../types';
import { getCompanionMedia, getMemoryPresentation } from './homePresentation';

describe('home presentation', () => {
  it('never exposes raw system subjects in memory copy', () => {
    const result = getMemoryPresentation({
      canonical_text: 'User stepped closer to the character and expressed a desire to stay with them all night',
      memory_type: 'relationship',
    }, 'Maya');
    expect(result.text).toBe('You stepped closer to Maya and said you wanted to stay with them all night.');
    expect(result.text.toLowerCase()).not.toContain('the character');
  });

  it('turns possessive database language into second-person copy', () => {
    const result = getMemoryPresentation({ canonical_text: "The user's dog is named Cooper", memory_type: 'semantic' }, 'Maya');
    expect(result.text).toBe('Your dog is named Cooper.');
  });

  it('keeps videos identifiable, uses their source image as artwork, and excludes voice notes', () => {
    const media = getCompanionMedia({
      characters: [{ id: 'maya', together_character_templates: { name: 'Maya Chen' } }],
      generatedMedia: [
        { id: 'voice', character_instance_id: 'maya', media_type: 'voice_note', status: 'ready', signed_url: 'https://example.com/voice.mp3', created_at: '2026-08-30T12:03:00Z' },
        { id: 'video', character_instance_id: 'maya', media_type: 'video', status: 'ready', signed_url: 'https://example.com/video.mp4', parent_media_id: 'photo', location_id: 'nightglass', created_at: '2026-08-30T12:02:00Z' },
        { id: 'photo', character_instance_id: 'maya', media_type: 'image', status: 'ready', signed_url: 'https://example.com/photo.jpg', location_id: 'nightglass', created_at: '2026-08-30T12:01:00Z' },
      ],
      moments: [],
      lifeEvents: [],
      dates: [],
      locations: [{ id: 'nightglass', name: 'Nightglass Observatory' }],
    } as unknown as Snapshot, 'maya');

    expect(media).toHaveLength(2);
    expect(media[0]).toMatchObject({ type: 'video', url: 'https://example.com/video.mp4', thumbnailUrl: 'https://example.com/photo.jpg', title: 'At Nightglass Observatory', context: 'FROM MAYA' });
    expect(media[1]?.type).toBe('image');
  });
});

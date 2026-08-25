import { describe, expect, it } from 'vitest';
import type { GeneratedMedia } from '../types';
import { latestConversationHeaderImage } from './chatHeaderMedia';

const image = (overrides: Partial<GeneratedMedia>): GeneratedMedia => ({
  id: 'media',
  character_instance_id: 'character',
  conversation_id: 'conversation-a',
  media_type: 'image',
  content_level: 'standard',
  status: 'ready',
  signed_url: 'https://example.com/photo.jpg',
  created_at: '2026-08-24T12:00:00.000Z',
  ...overrides,
});

describe('latestConversationHeaderImage', () => {
  it('returns the newest displayable image from the requested conversation', () => {
    const result = latestConversationHeaderImage([
      image({ id: 'new-other-chat', conversation_id: 'conversation-b', created_at: '2026-08-24T15:00:00.000Z' }),
      image({ id: 'old', created_at: '2026-08-24T12:00:00.000Z' }),
      image({ id: 'new', created_at: '2026-08-24T14:00:00.000Z' }),
    ], 'conversation-a');

    expect(result?.id).toBe('new');
  });

  it('ignores pending, failed, non-image, and unsigned media', () => {
    const result = latestConversationHeaderImage([
      image({ id: 'pending', status: 'generating' }),
      image({ id: 'failed', status: 'failed' }),
      image({ id: 'voice', media_type: 'voice_note' }),
      image({ id: 'unsigned', signed_url: null }),
    ], 'conversation-a');

    expect(result).toBeNull();
  });
});

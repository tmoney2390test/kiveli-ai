import { describe, expect, it } from 'vitest';
import { isMobileChatComposerElement, mobileChatViewport } from './mobileChatKeyboard';

describe('mobile chat keyboard pin', () => {
  it('recognizes the direct and group chat composers', () => {
    expect(isMobileChatComposerElement({ id: 'chat-message-composer' })).toBe(true);
    expect(isMobileChatComposerElement({ id: 'group-chat-message-composer' })).toBe(true);
  });

  it('does not pin for unrelated inputs or malformed elements', () => {
    expect(isMobileChatComposerElement({ id: 'explore-search' })).toBe(false);
    expect(isMobileChatComposerElement({})).toBe(false);
    expect(isMobileChatComposerElement(null)).toBe(false);
  });
});

describe('mobile chat visible frame', () => {
  it('fits above a keyboard that leaves the layout viewport unchanged', () => {
    expect(mobileChatViewport({ layoutHeight: 844, visualHeight: 480, offsetTop: 0, scale: 1 }))
      .toEqual({ height: 480, top: 0 });
  });

  it('follows Safari panning and restores the full frame after dismissal', () => {
    expect(mobileChatViewport({ layoutHeight: 844, visualHeight: 440, offsetTop: 54, scale: 1 }))
      .toEqual({ height: 440, top: 54 });
    expect(mobileChatViewport({ layoutHeight: 844, visualHeight: 844, offsetTop: 0, scale: 1 }))
      .toEqual({ height: 844, top: 0 });
  });

  it('does not subtract keyboard space twice when Android resizes the layout', () => {
    expect(mobileChatViewport({ layoutHeight: 480, visualHeight: 480, scale: 1 }))
      .toEqual({ height: 480, top: 0 });
    expect(mobileChatViewport({ layoutHeight: 480 })).toEqual({ height: 480, top: 0 });
  });

  it('ignores pinch zoom and invalid transient measurements', () => {
    expect(mobileChatViewport({ layoutHeight: 844, visualHeight: 422, scale: 2 })).toBeNull();
    expect(mobileChatViewport({ layoutHeight: 844, visualHeight: 0 })).toBeNull();
    expect(mobileChatViewport({ layoutHeight: Number.NaN })).toBeNull();
    expect(mobileChatViewport({ layoutHeight: 844, offsetTop: -10 })).toEqual({ height: 844, top: 0 });
  });
});

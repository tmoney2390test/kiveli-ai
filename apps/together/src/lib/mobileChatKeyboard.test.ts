import { describe, expect, it } from 'vitest';
import { chatRootFrameForVisibleViewport, isMobileChatComposerElement } from './mobileChatKeyboard';

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

describe('chat viewport alignment', () => {
  it('fills the visible area above the keyboard', () => {
    expect(chatRootFrameForVisibleViewport({rootTop:0,viewportTop:0,viewportHeight:390})).toEqual({height:390});
    expect(chatRootFrameForVisibleViewport({rootTop:0,viewportTop:80,viewportHeight:390})).toEqual({height:470});
  });

  it('keeps the composer at the visible bottom without moving the root', () => {
    expect(chatRootFrameForVisibleViewport({rootTop:0,viewportTop:550,viewportHeight:190})).toEqual({height:740});
  });

  it('accounts for layout scrolling without adding a second pan', () => {
    expect(chatRootFrameForVisibleViewport({rootTop:80,viewportTop:80,viewportHeight:390})).toEqual({height:390});
    expect(chatRootFrameForVisibleViewport({rootTop:40,viewportTop:0,viewportHeight:390})).toEqual({height:350});
    expect(chatRootFrameForVisibleViewport({rootTop:-80,viewportTop:80,viewportHeight:390})).toEqual({height:550});
  });
});

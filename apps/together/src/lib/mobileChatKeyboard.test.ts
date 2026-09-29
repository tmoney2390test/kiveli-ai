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
    expect(chatRootFrameForVisibleViewport({rootTop:0,viewportTop:0,viewportHeight:390})).toEqual({translateY:0,height:390});
    expect(chatRootFrameForVisibleViewport({rootTop:0,viewportTop:80,viewportHeight:390})).toEqual({translateY:0,height:470});
  });

  it('does not create an empty top gap when Safari pans the visual viewport', () => {
    expect(chatRootFrameForVisibleViewport({rootTop:0,viewportTop:550,viewportHeight:190})).toEqual({translateY:0,height:740});
  });

  it('only corrects an actual root shift', () => {
    expect(chatRootFrameForVisibleViewport({rootTop:80,viewportTop:80,viewportHeight:390})).toEqual({translateY:0,height:390});
    expect(chatRootFrameForVisibleViewport({rootTop:40,viewportTop:0,viewportHeight:390})).toEqual({translateY:0,height:350});
    expect(chatRootFrameForVisibleViewport({rootTop:-80,viewportTop:80,viewportHeight:390})).toEqual({translateY:80,height:470});
  });
});

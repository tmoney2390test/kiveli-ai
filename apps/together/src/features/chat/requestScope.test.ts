import { describe, expect, it } from 'vitest';
import { createChatRequestScope } from './requestScope';

describe('chat request ownership', () => {
  it('discards a late history response after leaving and returning to the same chat', async () => {
    const scope = createChatRequestScope();
    const isCurrent = scope.capture();
    let finish!: (messages: string[]) => void;
    let timeline = ['new conversation'];
    const read = new Promise<string[]>((resolve) => {
      finish = resolve;
    })
      .then((messages) => {
        if (isCurrent()) timeline = messages;
      });
    scope.dispose();
    scope.activate();
    finish(['old response']);
    await read;
    expect(timeline).toEqual(['new conversation']);
    expect(scope.capture()()).toBe(true);
  });

  it('admits only one pagination or reply action before React has rerendered', () => {
    const scope = createChatRequestScope();
    const first = scope.start('send')!;
    expect(scope.start('send')).toBeNull();
    expect(scope.start('older-history')).not.toBeNull();
    first.release();
    expect(scope.start('send')).not.toBeNull();
  });

  it('an old gallery response or finally cannot clear a newer request', () => {
    const scope = createChatRequestScope();
    const old = scope.start('gallery', true)!;
    const current = scope.start('gallery', true)!;
    expect(old.isCurrent()).toBe(false);
    old.release();
    expect(current.isCurrent()).toBe(true);
    expect(scope.start('gallery')).toBeNull();
  });

  it('cancels all lanes on unmount or account/Life change', () => {
    const scope = createChatRequestScope();
    const request = scope.start('reply')!;
    const read = scope.capture();
    scope.dispose();
    expect(request.isCurrent()).toBe(false);
    expect(read()).toBe(false);
    expect(scope.start('reply')).toBeNull();
  });
});

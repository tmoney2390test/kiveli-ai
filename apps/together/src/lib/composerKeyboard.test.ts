import { describe, expect, it } from 'vitest';
import { shouldConsumeComposerEnter, shouldSendComposerOnEnter } from './composerKeyboard';

const intent = (overrides: Partial<Parameters<typeof shouldSendComposerOnEnter>[0]> = {}) => ({
  platform: 'web',
  key: 'Enter',
  hasContent: true,
  disabled: false,
  ...overrides,
});

describe('shouldSendComposerOnEnter', () => {
  it('sends a populated desktop composer with Enter', () => {
    expect(shouldSendComposerOnEnter(intent())).toBe(true);
  });

  it('keeps Shift+Enter available for a newline', () => {
    expect(shouldSendComposerOnEnter(intent({ shiftKey: true }))).toBe(false);
  });

  it('does not send during IME composition', () => {
    expect(shouldSendComposerOnEnter(intent({ isComposing: true }))).toBe(false);
  });

  it('does not turn an empty Enter press into another composer action', () => {
    expect(shouldSendComposerOnEnter(intent({ hasContent: false }))).toBe(false);
    expect(shouldConsumeComposerEnter(intent({ hasContent: false }))).toBe(true);
  });

  it('does not change native multiline keyboard behavior', () => {
    expect(shouldSendComposerOnEnter(intent({ platform: 'ios' }))).toBe(false);
  });
});

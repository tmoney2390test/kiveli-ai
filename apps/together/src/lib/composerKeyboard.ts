export type ComposerEnterIntent = {
  platform: string;
  key: string;
  shiftKey?: boolean;
  isComposing?: boolean;
  hasContent: boolean;
  disabled: boolean;
};

/**
 * Desktop chat convention: Enter sends and Shift+Enter inserts a newline.
 * Native soft keyboards retain their normal multiline behavior.
 */
export function shouldSendComposerOnEnter(intent: ComposerEnterIntent): boolean {
  return shouldConsumeComposerEnter(intent) &&
    intent.hasContent &&
    !intent.disabled;
}

export function shouldConsumeComposerEnter(
  intent: Pick<ComposerEnterIntent, 'platform' | 'key' | 'shiftKey' | 'isComposing'>,
): boolean {
  return intent.platform === 'web' &&
    intent.key === 'Enter' &&
    !intent.shiftKey &&
    !intent.isComposing;
}

export function visibleKeyboardTop(screenY: number, keyboardHeight: number, screenHeight: number): number | null {
  if (Number.isFinite(screenY) && Number.isFinite(screenHeight) &&
      screenY > screenHeight * 0.25 && screenY <= screenHeight) return screenY;
  // Some iOS keyboard transitions report screenY=0. Use the height only when
  // it describes a plausible docked keyboard; otherwise wait for the next frame.
  if (Number.isFinite(keyboardHeight) && Number.isFinite(screenHeight) &&
      keyboardHeight > 100 && keyboardHeight < screenHeight * 0.7) return screenHeight - keyboardHeight;
  return null;
}

export function nativeChatKeyboardInset(rootBottom: number, keyboardTop: number | null): number {
  if (keyboardTop === null || !Number.isFinite(rootBottom)) return 0;
  return Math.max(0, Math.round(rootBottom - keyboardTop));
}

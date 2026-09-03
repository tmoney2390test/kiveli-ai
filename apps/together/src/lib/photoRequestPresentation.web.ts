export * from './photoRequestPresentation.shared';
import { classifyPhotoIntent } from '@together/domain/src/media';

const HARD_BLOCKED_PREVIEW_PATTERN=/\b(underage|minors?|children?|schoolgirls?|schoolboys?|non[- ]?consensual|without (?:her|his|their) consent|force(?:d|s|ing)? (?:her|him|them)|celebrity|public figure|look exactly like|face of|identical to)\b/i;

/** Web may optimistically present all otherwise eligible photo requests. */
export function shouldShowPhotoGenerationPending(text:string):boolean{
  return classifyPhotoIntent(text).requested&&!HARD_BLOCKED_PREVIEW_PATTERN.test(text);
}

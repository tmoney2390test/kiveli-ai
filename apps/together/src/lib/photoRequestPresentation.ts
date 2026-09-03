export * from './photoRequestPresentation.shared';

// This only controls the optimistic loading treatment. The server remains the
// authority for moderation and for deciding whether a media job may be queued.
const HARD_BLOCKED_PREVIEW_PATTERN = /\b(underage|minors?|children?|schoolgirls?|schoolboys?|non[- ]?consensual|without (?:her|his|their) consent|force(?:d|s|ing)? (?:her|him|them)|celebrity|public figure|look exactly like|face of|identical to)\b/i;
const NATIVE_UNAVAILABLE_MEDIA_PATTERN=/\b(?:adult|explicit|nsfw|nude|naked|topless|bottomless|porn(?:ographic)?|sexual|sexually|genitals?|breasts?|nipples?|penis|vagina|vulva)\b/i;
const SAFE_PHOTO_REQUEST=/\b(?:send|show|share|take|snap|make|create|generate)\b[^.!?]{0,64}\b(?:photos?|pictures?|pics?|selfies?|images?|outfit|where you are|the view)\b|\b(?:can|could|may) i (?:see|get|have)\b[^.!?]{0,48}\b(?:photos?|pictures?|pics?|selfies?|images?|your outfit|the view)\b|\b(?:outfit|fit) check\b/i;
const PHOTO_DISCUSSION=/\b(?:sent|shared|showed|took|uploaded|remember|delete|remove|edit|download)\b[^.!?]{0,40}\b(?:photos?|pictures?|pics?|selfies?|images?)\b/i;

export function shouldShowPhotoGenerationPending(text: string): boolean {
  return SAFE_PHOTO_REQUEST.test(text) && !PHOTO_DISCUSSION.test(text) && !HARD_BLOCKED_PREVIEW_PATTERN.test(text) && !NATIVE_UNAVAILABLE_MEDIA_PATTERN.test(text);
}

const PHOTO_REQUEST_PATTERN = /\b(send|show|take|share|see|want|lemme|let me)\b.{0,40}\b(photo|picture|pic|selfie|outfit|look|where you are|what you(?:'re| are) doing)\b|\b(selfie|photo|picture|pic)\s*\??$/i;

// This only controls the optimistic loading treatment. The server remains the
// authority for moderation and for deciding whether a media job may be queued.
const HARD_BLOCKED_PREVIEW_PATTERN = /\b(underage|minors?|children?|schoolgirls?|schoolboys?|non[- ]?consensual|without (?:her|his|their) consent|force(?:d|s|ing)? (?:her|him|them)|celebrity|public figure|look exactly like|face of|identical to)\b/i;

export function shouldShowPhotoGenerationPending(text: string): boolean {
  return PHOTO_REQUEST_PATTERN.test(text) && !HARD_BLOCKED_PREVIEW_PATTERN.test(text);
}

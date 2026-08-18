const PHOTO_REQUEST_PATTERN = /\b(send|show|take|share|see|want|lemme|let me)\b.{0,40}\b(photo|picture|pic|selfie|outfit|look|where you are|what you(?:'re| are) doing)\b|\b(selfie|photo|picture|pic)\s*\??$/i;

// This only controls the optimistic loading treatment. The server remains the
// authority for moderation and for deciding whether a media job may be queued.
const NON_GENERATABLE_PREVIEW_PATTERN = /\b(nudes?|naked|topless|strip|tits?|boobs?|breasts?|pussy|dick|cock|sex|sexual|explicit|underage|minors?|children?)\b/i;

export function shouldShowPhotoGenerationPending(text: string): boolean {
  return PHOTO_REQUEST_PATTERN.test(text) && !NON_GENERATABLE_PREVIEW_PATTERN.test(text);
}

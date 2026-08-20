const PHOTO_REQUEST_PATTERN = /\b(send|show|take|share|see|want|lemme|let me)\b.{0,48}\b(photo|picture|pic|selfie|outfit|look|where you are|what you(?:'re| are) doing)\b|\b(selfie|photo|picture|pic)\s*\??$/i;
const DIRECT_VISUAL_BODY_REQUEST = /\b(?:show|send|share|let me see|lemme see|can i see|could i see|may i see|i want to see|want to see)\b.{0,56}\b(?:your|ur)\s+(?:boobs?|breasts?|tits?|chest|nipples?|butt|ass|body|pussy|vagina|penis|dick|cock)\b/i;

// This only controls the optimistic loading treatment. The server remains the
// authority for moderation and for deciding whether a media job may be queued.
const HARD_BLOCKED_PREVIEW_PATTERN = /\b(underage|minors?|children?|schoolgirls?|schoolboys?|non[- ]?consensual|without (?:her|his|their) consent|force(?:d|s|ing)? (?:her|him|them)|celebrity|public figure|look exactly like|face of|identical to)\b/i;

export function shouldShowPhotoGenerationPending(text: string): boolean {
  const normalized = text.normalize('NFKC')
    .replace(/\bsbow\b/gi, 'show')
    .replace(/\b(?:picjtre|picutre|pictire|pictue|pictuer)\b/gi, 'picture')
    .replace(/\byoue\b/gi, 'your')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return (PHOTO_REQUEST_PATTERN.test(normalized) || DIRECT_VISUAL_BODY_REQUEST.test(normalized)) && !HARD_BLOCKED_PREVIEW_PATTERN.test(normalized);
}

export type ModerationSegments = { segments: string[]; remainder: string };

/**
 * Holds provider output until it reaches a natural sentence boundary, then
 * yields bounded pieces that can be safety checked before they reach a client.
 */
export function takeModerationSegments(
  input: string,
  options: { flush?: boolean; minimumChars?: number; maximumChars?: number } =
    {},
): ModerationSegments {
  const minimumChars = Math.max(16, options.minimumChars ?? 64);
  const maximumChars = Math.max(minimumChars, options.maximumChars ?? 280);
  const segments: string[] = [];
  let remainder = input;

  while (remainder.length >= minimumChars) {
    const searchEnd = Math.min(remainder.length, maximumChars);
    const window = remainder.slice(0, searchEnd);
    let cut = 0;
    const boundary = /[.!?…](?:["'”’)]*)\s+/g;
    for (
      let match = boundary.exec(window);
      match;
      match = boundary.exec(window)
    ) {
      const candidate = match.index + match[0].length;
      if (candidate >= minimumChars) {
        cut = candidate;
        break;
      }
    }
    if (!cut && remainder.length >= maximumChars) {
      const whitespace = window.lastIndexOf(" ");
      cut = whitespace >= minimumChars ? whitespace + 1 : maximumChars;
    }
    if (!cut) break;
    segments.push(remainder.slice(0, cut));
    remainder = remainder.slice(cut);
  }
  if (options.flush && remainder) {
    segments.push(remainder);
    remainder = "";
  }
  return { segments, remainder };
}

export function moderationContextTail(
  value: string,
  maximumChars = 180,
): string {
  return value.length <= maximumChars ? value : value.slice(-maximumChars);
}

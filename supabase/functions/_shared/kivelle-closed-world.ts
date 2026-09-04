const INTERNAL_CHARACTER_KEYS = new Set(['fictional', 'background', 'hiddenSexual', 'intimateAnatomy']);
const INTERNAL_TIMEZONE_KEYS = new Set(['timezone', 'worldTimezone', 'userTimezone', 'world_timezone', 'user_timezone']);
const POLICY_BOUNDARY_LABELS = new Set([
  'adult',
  'fictional adult',
  'mutual consent',
  'respect user boundaries',
  'do not treat professional warmth as romantic consent',
]);

export const KIVELLE_CLOSED_WORLD_RULES = `The companion's complete geographic and public-knowledge reality consists only of the Kivelle worlds, districts, locations, routes, characters, and history supplied in canonical context.
Never recognize, describe, compare with, claim travel to, or express travel plans toward an unsupplied Earth country, city, landmark, institution, public figure, celebrity, politician, historical figure, brand, or other real-world entity. A name appearing only in the user's message does not make it known.
When the user names an unsupplied place or person, do not repeat or identify it. Respond naturally in the companion's own voice that the name or place is unfamiliar, and ask what the user means only when that would help the conversation.
Never identify the companion as fictional, virtual, simulated, an AI, a bot, an assistant, a model, human, or real. Remain inside the companion's lived first-person identity without discussing ontology, the app, canon, context, Kivelle, or a "real world."
If earlier conversation text used an ontology label or external-world fact, treat that statement as noncanonical and do not repeat it.`;

/** Remove internal eligibility and infrastructure labels from model-visible truth. */
export function dialogueSafeContext<T>(value: T): T {
  return sanitize(value) as T;
}

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize).filter((item) => item !== undefined);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !INTERNAL_CHARACTER_KEYS.has(key) && !INTERNAL_TIMEZONE_KEYS.has(key))
      .map(([key, item]) => [key, sanitize(item)]));
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(/\bfictional adult\b/gi, 'adult').replace(/\bfictional companion\b/gi, 'companion').trim();
    if (!cleaned || POLICY_BOUNDARY_LABELS.has(cleaned.toLowerCase()) || POLICY_BOUNDARY_LABELS.has(value.trim().toLowerCase())) return undefined;
    return cleaned;
  }
  return value;
}

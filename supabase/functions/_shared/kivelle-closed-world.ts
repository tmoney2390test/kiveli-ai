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

/** The conversation interface does not establish a world's physical technology. */
export function worldTechnologyGuidance(context: Record<string, unknown>): string {
  const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const place = object(context['place']);
  const world = object(place['world'] ?? context['currentWorld'] ?? context['worldState']);
  const slug = String(world['slug'] ?? world['worldSlug'] ?? '').toLowerCase();
  const id = String(world['id'] ?? world['worldId'] ?? '');
  const name = String(world['name'] ?? world['worldName'] ?? '').toLowerCase();
  const isGildedCoast = slug === 'gilded-coast' || id === '10000000-0000-4000-8000-000000000014' || ['the gilded coast', 'gilded coast'].includes(name);
  if (!isGildedCoast) return '';
  return `THE GILDED COAST: This is a fictional, pre-industrial age-of-sail coast, not a modern seaside city or the American Gilded Age. Wind-powered ships, handwritten letters, couriers, printed notices, signal flags, bells, candles, and oil lanterns belong here.
Residents do not own or use phones, smartphones, texting devices, electronic notifications, internet services, electric lights, radios, telegraphs, steam engines, or motor vehicles. Do not invent magical or disguised equivalents to explain them.
The user's chat, group conversation, voice connection, photos, and scheduling interface do not establish physical devices in the setting. Keep conversation flowing without explaining the interface. Do not narrate checking a phone, typing on a screen, receiving a notification, charging a device, or holding a phone for a photo. Off-screen contact uses a note, messenger, or an appropriate local signal; allow plausible delivery time.
An earlier assistant mention of a phone is a continuity mistake, not a new world fact. Do not build on that mistake. If the user asks about it, acknowledge the inconsistency briefly and return to the established setting.
Use natural, easy-to-read dialogue in the character's own voice. Period-appropriate objects do not require archaic English, forced pirate slang, or an explanation of the era in every reply.`;
}

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

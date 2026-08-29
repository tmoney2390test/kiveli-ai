export type CharacterMentionTarget = {
  id: string;
  name: string;
  slug: string;
};

export type CharacterMentionSegment =
  | { kind: 'text'; text: string }
  | { kind: 'character'; text: string; character: CharacterMentionTarget };

type CharacterMentionLabel = {
  label: string;
  normalized: string;
  character: CharacterMentionTarget;
};

const WORD_CHARACTER = /[\p{L}\p{N}_]/u;

/**
 * Finds character names without treating ordinary words as names. Full names
 * are always eligible; first names are eligible only when unique in the world.
 */
export function parseCharacterMentions(
  text: string,
  characters: CharacterMentionTarget[],
): CharacterMentionSegment[] {
  if (!text || !characters.length) return [{ kind: 'text', text }];

  const labels = mentionLabels(characters);
  if (!labels.length) return [{ kind: 'text', text }];

  const byLabel = new Map(labels.map((entry) => [entry.normalized, entry]));
  const pattern = new RegExp(labels.map((entry) => escapeRegExp(entry.label)).join('|'), 'giu');
  const segments: CharacterMentionSegment[] = [];
  let cursor = 0;

  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    const value = match[0] ?? '';
    const end = start + value.length;
    const before = start > 0 ? text[start - 1] : '';
    const after = end < text.length ? text[end] : '';
    if ((before && WORD_CHARACTER.test(before)) || (after && WORD_CHARACTER.test(after))) continue;

    const target = byLabel.get(value.toLocaleLowerCase());
    if (!target) continue;
    if (start > cursor) segments.push({ kind: 'text', text: text.slice(cursor, start) });
    segments.push({ kind: 'character', text: value, character: target.character });
    cursor = end;
  }

  if (!segments.length) return [{ kind: 'text', text }];
  if (cursor < text.length) segments.push({ kind: 'text', text: text.slice(cursor) });
  return segments;
}

function mentionLabels(characters: CharacterMentionTarget[]): CharacterMentionLabel[] {
  const unique = new Map<string, CharacterMentionTarget>();
  for (const character of characters) {
    const name = character.name.trim();
    if (name) unique.set(character.id, { ...character, name });
  }

  const firstNameCounts = new Map<string, number>();
  for (const character of unique.values()) {
    const firstName = character.name.split(/\s+/u)[0]?.toLocaleLowerCase();
    if (firstName) firstNameCounts.set(firstName, (firstNameCounts.get(firstName) ?? 0) + 1);
  }

  const labels = new Map<string, CharacterMentionLabel>();
  for (const character of unique.values()) {
    const fullName = character.name;
    labels.set(fullName.toLocaleLowerCase(), {
      label: fullName,
      normalized: fullName.toLocaleLowerCase(),
      character,
    });
    const firstName = fullName.split(/\s+/u)[0];
    if (firstName && firstNameCounts.get(firstName.toLocaleLowerCase()) === 1) {
      labels.set(firstName.toLocaleLowerCase(), {
        label: firstName,
        normalized: firstName.toLocaleLowerCase(),
        character,
      });
    }
  }

  return [...labels.values()].sort((left, right) => right.label.length - left.label.length);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Converts canonical third-person memory facts into natural user-facing copy.
 * Canonical storage stays untouched so prompts, deduplication, and editing keep
 * their stable representation.
 */
export function presentMemoryText(canonicalText: string, companionName?: string): string {
  let text = canonicalText.trim();
  if (!text) return '';

  text = text
    .replace(/\bthe user[’']s\b/gi, 'your')
    .replace(/\buser[’']s\b/gi, 'your');

  if (companionName) {
    const escapedName = escapeRegExp(companionName);
    text = text
      .replace(/\bthe character[’']s\b/gi, `${companionName}'s`)
      .replace(/\bthe character\b/gi, companionName)
      .replace(new RegExp(`^(?:the )?user told ${escapedName}(?: that)? they\\b`, 'i'), `You told ${companionName} you`);
  } else {
    text = text
      .replace(/\bthe character[’']s\b/gi, "their companion's")
      .replace(/\bthe character\b/gi, 'their companion');
  }

  text = text
    .replace(/\bthe user\b/gi, 'you')
    .replace(/\buser\b/gi, 'you')
    .replace(/\byou doesn't\b/gi, "you don't")
    .replace(/\byou isn't\b/gi, "you aren't")
    .replace(/\byou hasn't\b/gi, "you haven't")
    .replace(/\byou wasn't\b/gi, "you weren't")
    .replace(/\byou (likes|dislikes|loves|hates|prefers|enjoys|wants|feels|knows|remembers|believes|thinks|works|lives|plays|watches|reads|listens|visits|avoids|needs|hopes|plans|values|appreciates|supports|calls|goes|tries|studies|carries|misses|wishes|owns|follows|uses|speaks|cooks|travels|drinks|eats)\b/gi, (_match, verb: string) => `you ${FIRST_PERSON_VERBS[verb.toLowerCase()] ?? verb.toLowerCase()}`)
    .replace(/\byou has\b/gi, 'you have')
    .replace(/\byou is\b/gi, 'you are')
    .replace(/\byou was\b/gi, 'you were')
    .replace(/\byou does\b/gi, 'you do')
    .replace(/^You told them(?: that)? they\b/i, 'You told them you')
    .replace(/expressed (?:a )?desire to/gi, 'said you wanted to')
    .replace(/stated that/gi, 'said')
    .replace(/indicated that/gi, 'made it clear')
    .replace(/\s+/g, ' ')
    .replace(/^[a-z]/, (letter) => letter.toUpperCase());

  if (!/[.!?]$/.test(text)) text += '.';
  return text;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const FIRST_PERSON_VERBS: Record<string, string> = {
  likes: 'like', dislikes: 'dislike', loves: 'love', hates: 'hate', prefers: 'prefer', enjoys: 'enjoy',
  wants: 'want', feels: 'feel', knows: 'know', remembers: 'remember', believes: 'believe', thinks: 'think',
  works: 'work', lives: 'live', plays: 'play', watches: 'watch', reads: 'read', listens: 'listen',
  visits: 'visit', avoids: 'avoid', needs: 'need', hopes: 'hope', plans: 'plan', values: 'value',
  appreciates: 'appreciate', supports: 'support', calls: 'call', goes: 'go', tries: 'try', studies: 'study',
  carries: 'carry', misses: 'miss', wishes: 'wish', owns: 'own', follows: 'follow', uses: 'use',
  speaks: 'speak', cooks: 'cook', travels: 'travel', drinks: 'drink', eats: 'eat',
};

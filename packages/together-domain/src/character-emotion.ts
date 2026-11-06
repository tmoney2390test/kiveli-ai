/** A character's mood is separate from the user's intent and from relationship conflict. */
export type CharacterEmotionTone =
  | 'steady' | 'angry' | 'frustrated' | 'weary' | 'sad' | 'anxious'
  | 'excited' | 'playful' | 'tense';

export type CharacterEmotionalReality = {
  tone: CharacterEmotionTone;
  intensity: number;
  source: 'scene' | 'residue' | 'relationship' | 'none';
  target: 'user' | 'external' | 'unknown';
  guidance: string;
};

/** A narrow signal for a direct insult, not for swearing about the character's day. */
export function directDisrespectSignal(message: string): boolean {
  const text = message.trim().toLowerCase();
  if (/\b(jk|joking|kidding|lol|lmao)\b/.test(text)) return false;
  return /^(?:fuck you|screw you|shut up|you(?:'re| are) (?:such )?(?:an? )?(?:idiot|moron|worthless|useless))\b/.test(text);
}

/** The user's anger is not automatically an argument with the character. */
export function userDirectedConflictSignal(message: string): boolean {
  const text = message.trim().toLowerCase();
  return directDisrespectSignal(text) ||
    /^(?:leave me alone|you (?:lied|hurt me|ignored me|stood me up))\b/.test(text) ||
    /\bi(?:'m| am) (?:angry|upset|hurt|furious) (?:with|at|because of) you\b/.test(text);
}

type Residue = {
  tone?: string;
  intensity?: number;
  target?: string;
} | null;

function toneOf(value: unknown): CharacterEmotionTone {
  const text = typeof value === 'string' ? value.toLowerCase().replace(/[_-]+/g, ' ') : '';
  if (/\b(angry|furious|pissed|livid|enraged)\b/.test(text)) return 'angry';
  if (/\b(frustrat\w*|annoy\w*|irritat\w*|fed up)\b/.test(text)) return 'frustrated';
  if (/\b(exhaust\w*|tired|drained|weary|overworked|burnt out|burned out|bad day|rough day)\b/.test(text)) return 'weary';
  if (/\b(sad|griev\w*|lonely|deflated|heartbroken|miserable)\b/.test(text)) return 'sad';
  if (/\b(anxious|worried|nervous|uneasy|afraid)\b/.test(text)) return 'anxious';
  if (/\b(excit\w*|thrilled|elated|delighted)\b/.test(text)) return 'excited';
  if (/\b(playful|amused|mischievous)\b/.test(text)) return 'playful';
  if (/\b(tense|guarded|strained)\b/.test(text)) return 'tense';
  return 'steady';
}

function guidance(tone: CharacterEmotionTone, target: CharacterEmotionalReality['target']): string {
  if (tone === 'steady') return '';
  const direction: Record<Exclude<CharacterEmotionTone, 'steady'>, string> = {
    angry: 'Anger may make the reply sharper, shorter, or less accommodating. Do not force instant forgiveness or a reassuring question.',
    frustrated: 'Frustration may show in a blunt answer, a complaint, or a refusal to smooth things over. Do not turn it into a lecture.',
    weary: 'Low energy may mean a plain answer, less patience, or a wish to stop talking. Do not turn tiredness into generic comfort or a confession.',
    sad: 'A low mood can make the character quieter or less certain. Disclosure still follows their personality and trust.',
    anxious: 'Worry may narrow attention or shorten the reply. Do not invent a threat or deliver a coping exercise.',
    excited: 'Enthusiasm can show in specific attention and initiative; do not force cheerfulness into unrelated turns.',
    playful: 'Humor can emerge from the actual exchange; do not add a joke or teasing by quota.',
    tense: 'Unresolved friction may remain in the tone. Do not reset to effortless warmth or claim the conflict is resolved.',
  };
  const attribution = target === 'external'
    ? 'The user did not cause this mood; do not blame them for it.'
    : target === 'unknown'
    ? 'Its cause is not established; do not invent one or blame the user.'
    : 'This tension concerns the user, but respond to what actually happened rather than attacking them as a person.';
  return `${direction[tone]} ${attribution}`;
}

/** Uses only established scene, per-character residue, and relationship state. */
export function resolveCharacterEmotionalReality(input: {
  mood?: string | null;
  energy?: string | null;
  residue?: Residue;
  relationshipConflict?: number;
  activeMajorConflict?: boolean;
}): CharacterEmotionalReality {
  const sceneTone = toneOf(input.mood);
  const residueTone = toneOf(input.residue?.tone);
  const residueIntensity = Number(input.residue?.intensity ?? 0);
  const hasResidue = residueTone !== 'steady' && Number.isFinite(residueIntensity) && residueIntensity >= .12;
  const conflict = Number(input.relationshipConflict ?? 0);
  const hasRelationshipTension = input.activeMajorConflict === true || (Number.isFinite(conflict) && conflict >= 45);
  let tone: CharacterEmotionTone = 'steady';
  let source: CharacterEmotionalReality['source'] = 'none';
  let target: CharacterEmotionalReality['target'] = 'unknown';
  let intensity = 0;

  if (sceneTone !== 'steady') {
    tone = sceneTone;
    source = 'scene';
    intensity = .55;
  } else if (/\b(low|exhausted|drained)\b/i.test(String(input.energy ?? ''))) {
    tone = 'weary';
    source = 'scene';
    intensity = .32;
  }
  if (hasResidue && (tone === 'steady' || residueIntensity >= intensity)) {
    tone = residueTone;
    source = 'residue';
    intensity = Math.min(1, Math.max(0, residueIntensity));
    target = input.residue?.target === 'user' ? 'user'
      : input.residue?.target === 'external' ? 'external' : 'unknown';
  }
  if (hasRelationshipTension && (tone === 'steady' || tone === 'playful' || tone === 'excited')) {
    tone = 'tense';
    source = 'relationship';
    target = 'user';
    intensity = .45;
  }
  return { tone, intensity, source, target, guidance: guidance(tone, target) };
}

type Residue = {
  tone: string;
  valence: number;
  intensity: number;
  halfLifeMinutes: number;
  target: 'user' | 'external' | 'unknown';
  cause: 'user_conflict' | 'day_pressure' | 'accepted_repair' | 'personal_feeling';
};

/** Only the companion's own response can establish their feeling. */
export function deriveEmotionalResidue(userText: string, assistantText: string): Residue | null {
  const user = userText.toLowerCase();
  const reply = assistantText.toLowerCase();
  const userConflict = /\b(you lied|you hurt me|what you said hurt|do not speak to me like that|don't speak to me like that|that was (?:cruel|a shitty thing to say)|i(?:'m| am) (?:still )?(?:angry|pissed|furious) (?:with|at) you)\b/.test(reply);
  const selfAnger = /\b(i(?:'m| am) (?:still |really |so )?(?:angry|pissed|furious|frustrated|annoyed)|that (?:pissed me off|made me angry))\b/.test(reply);
  const externalPressure=/\b(work|job|shift|lab|samples|project|meeting|office|client)\b/.test(reply)&&!/\byou\b/.test(reply);
  if (userConflict || selfAnger) {
    return { tone: userConflict ? 'angry' : 'frustrated', valence: -.55, intensity: userConflict ? .65 : .5,
      halfLifeMinutes: 240, target: userConflict ? 'user' : externalPressure ? 'external' : 'unknown',
      cause: userConflict ? 'user_conflict' : externalPressure ? 'day_pressure' : 'personal_feeling' };
  }
  // An apology offered by the user is not accepted until the companion says so.
  // Explicitly remaining angry takes precedence over a partial acceptance.
  if (/\b(i forgive you|i accept your apology|thank you for apologi[sz]ing(?: to me)?|we(?:'re| are) (?:okay|alright) now)\b/.test(reply) &&
      /\b(sorry|apologi[sz]e|my fault)\b/.test(user)) {
    return { tone: 'reassured', valence: .4, intensity: .4, halfLifeMinutes: 120, target: 'user', cause: 'accepted_repair' };
  }
  if (/\b(?:a |one )?(?:bad|rough|shitty|awful) day\b/.test(reply) ||
      /\bi(?:'m| am) (?:really |so )?(?:tired|exhausted|drained|worn out)\b/.test(reply)) {
    return { tone: 'weary', valence: -.35, intensity: .42, halfLifeMinutes: 180,
      target: externalPressure ? 'external' : 'unknown',
      cause: 'day_pressure' };
  }
  if (/\bi(?:'m| am) (?:really |so )?(?:excited|thrilled)\b/.test(reply)) {
    return { tone: 'excited', valence: .5, intensity: .35, halfLifeMinutes: 180, target: 'unknown', cause: 'personal_feeling' };
  }
  if (/\b(?:ha(?:ha)+|i(?:'m| am) (?:just )?(?:joking|kidding|teasing))\b/.test(reply)) {
    return { tone: 'playful', valence: .3, intensity: .2, halfLifeMinutes: 120, target: 'unknown', cause: 'personal_feeling' };
  }
  return null;
}

export async function upsertEmotionalResidue(input: { db: any; userId: string; continuityId: string; characterInstanceId: string; sourceId: string; sourceType?: 'message'|'scene'|'plan'|'date'|'moment'|'life_event'; residue: Residue; now?: Date }): Promise<void> {
  const now = input.now ?? new Date();
  const expires = new Date(now.getTime() + input.residue.halfLifeMinutes * 4 * 60_000).toISOString();
  await input.db.from('together_emotional_residue').upsert({
    user_id: input.userId,
    continuity_id: input.continuityId,
    character_instance_id: input.characterInstanceId,
    tone: input.residue.tone,
    valence: input.residue.valence,
    intensity: input.residue.intensity,
    source_type: input.sourceType ?? 'message',
    source_id: input.sourceId,
    started_at: now.toISOString(),
    half_life_minutes: input.residue.halfLifeMinutes,
    expires_at: expires,
    metadata: { version: 2, deterministic: true, target: input.residue.target, cause: input.residue.cause },
    updated_at: now.toISOString(),
  }, { onConflict: 'character_instance_id' });
}

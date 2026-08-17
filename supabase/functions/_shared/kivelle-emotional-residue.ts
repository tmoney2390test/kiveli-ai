type Residue = { tone: string; valence: number; intensity: number; halfLifeMinutes: number };

/** Small, deterministic signals only. Relationship conflict remains canonical elsewhere. */
export function deriveEmotionalResidue(userText: string, assistantText: string): Residue | null {
  const text = `${userText} ${assistantText}`.toLowerCase();
  if (/\b(sorry|apologi[sz]e|my fault|wasn't fair|was not fair)\b/.test(text)) return { tone: 'reassured', valence: .45, intensity: .36, halfLifeMinutes: 120 };
  if (/\b(angry|upset|annoyed|hurt|frustrated)\b/.test(text)) return { tone: 'slightly_annoyed', valence: -.42, intensity: .34, halfLifeMinutes: 180 };
  if (/\b(can't wait|cannot wait|so excited|really excited)\b/.test(text)) return { tone: 'excited', valence: .58, intensity: .34, halfLifeMinutes: 360 };
  if (/\b(lol|lmao|haha|teas(?:e|ing)|joking)\b/.test(text)) return { tone: 'playful', valence: .35, intensity: .22, halfLifeMinutes: 120 };
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
    metadata: { version: 1, deterministic: true },
    updated_at: now.toISOString(),
  }, { onConflict: 'character_instance_id' });
}

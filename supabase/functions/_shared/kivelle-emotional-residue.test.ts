import { deriveEmotionalResidue, upsertEmotionalResidue } from './kivelle-emotional-residue.ts';
import { activeEmotionalResidue } from './kivelle-memory.ts';

const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };

Deno.test('the user being angry or apologizing does not assign that feeling to the companion', () => {
  assert(deriveEmotionalResidue('I am angry about work.', 'What happened?') === null, 'user anger leaked into companion');
  assert(deriveEmotionalResidue('I am sorry.', 'I hear you. I still need time.') === null, 'apology was treated as forgiveness');
  assert(deriveEmotionalResidue('Fuck, the meeting was awful.', 'That sounds exhausting.') === null, 'ordinary profanity became anger');
});

Deno.test('the companion carries a bad day and a user-directed grievance separately', () => {
  const day = deriveEmotionalResidue('How was your day?', 'A shitty day. The samples at work kept failing.');
  assert(day?.tone === 'weary' && day.target === 'external', 'work frustration was misattributed');
  const frustrated = deriveEmotionalResidue('How was your day?', 'I am frustrated with the samples at the lab.');
  assert(frustrated?.tone === 'frustrated' && frustrated.target === 'external', 'job frustration was misattributed');
  const grievance = deriveEmotionalResidue('How was your day?', 'I am still angry with you. You lied.');
  assert(grievance?.tone === 'angry' && grievance.target === 'user', 'character grievance was not carried');
  const accepted = deriveEmotionalResidue('I am sorry I lied.', 'I accept your apology. We are okay now.');
  assert(accepted?.tone === 'reassured' && accepted.target === 'user', 'earned repair was lost');
  const partial = deriveEmotionalResidue('I am sorry I lied.', 'I accept your apology, but I am still angry with you.');
  assert(partial?.tone === 'angry' && partial.target === 'user', 'partial repair erased anger');
  assert(deriveEmotionalResidue('Ha, good one.', 'That was funny.') === null, 'user playfulness was copied to the companion');
  assert(deriveEmotionalResidue('Hi.', 'Haha, I was joking.')?.tone === 'playful', 'companion playfulness was lost');
});

Deno.test('residue stores only categorical cause and target and decays for the same character', async () => {
  let written: Record<string, unknown> | null = null;
  const db = { from: () => ({ upsert: (row: Record<string, unknown>) => { written = row; return Promise.resolve({ error: null }); } }) };
  const now = new Date('2026-10-06T12:00:00.000Z');
  const residue = deriveEmotionalResidue('How was your day?', 'A rough day at the lab. I am exhausted.');
  if (!residue) throw new Error('expected a residue');
  await upsertEmotionalResidue({ db, userId: 'user', continuityId: 'life', characterInstanceId: 'character', sourceId: 'message', residue, now });
  const row = written as Record<string, unknown> | null;
  assert(row?.character_instance_id === 'character', 'wrong character owner');
  assert((row?.metadata as Record<string, unknown>)?.target === 'external', 'target not retained');
  assert((row?.metadata as Record<string, unknown>)?.cause === 'day_pressure', 'categorical cause not retained');
  assert(activeEmotionalResidue(row, now)?.target === 'external', 'active target not restored');
});

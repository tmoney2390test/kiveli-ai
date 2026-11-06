import { describe, expect, it } from 'vitest';
import { directDisrespectSignal, resolveCharacterEmotionalReality, userDirectedConflictSignal } from './character-emotion.ts';
import { compileRelationshipStance, compileResponseBrief, preserveCharacterEmotionalPosture } from './prompting.ts';
import { compileCharacterVoiceCard } from './character-depth.ts';

const stance = compileRelationshipStance({ relationship_stage: 'friend', trust: 58, comfort: 60 });

describe('character emotion across every character voice', () => {
  it('keeps an external bad day separate from user conflict', () => {
    const emotion = resolveCharacterEmotionalReality({
      mood: 'focused',
      residue: { tone: 'weary', intensity: .42, target: 'external' },
    });
    const brief = compileResponseBrief({
      message: 'How was your day?', interactionQuality: 'normal', relationshipStance: stance,
      characterEmotion: emotion,
    });
    expect(emotion).toMatchObject({ tone: 'weary', target: 'external' });
    expect(brief.mode).toBe('casual');
    expect(brief.emotionalPosture).toContain('The user did not cause this mood');
    expect(brief.emotionalPosture).not.toContain('coping exercise');
  });

  it('carries justified anger into an ordinary turn without forcing a question', () => {
    const emotion = resolveCharacterEmotionalReality({
      mood: 'content', residue: { tone: 'angry', intensity: .65, target: 'user' },
    });
    const brief = compileResponseBrief({
      message: 'How was your day?', interactionQuality: 'meaningful', relationshipStance: stance,
      characterEmotion: emotion,
    });
    expect(brief.mode).toBe('conflicted');
    expect(brief.handoff.mode).toBe('none');
    expect(brief.emotionalPosture).toContain('Do not force instant forgiveness');
    const dueThread = compileResponseBrief({
      message: 'Hi.', interactionQuality: 'normal', relationshipStance: stance,
      characterEmotion: emotion, now: new Date('2026-10-06T12:00:00Z'),
      eligibleOpenThread: { id: 'thread', displaySubject: 'presentation', followupPrompt: 'Ask how it went.',
        expectedAt: '2026-10-05T12:00:00Z', eligible: true, lastFollowedUpAt: null, followupCount: 0 },
    });
    expect(dueThread.handoff.mode).toBe('none');
    const card = compileCharacterVoiceCard({
      bible: { occupation: 'Research scientist', voice: { profanity: 'rare, only when genuinely angry' } },
      message: 'How was your day?', mode: brief.mode, emotionalReality: emotion,
    });
    expect(card.performance?.state).toBe('angry');
    expect(card.profanity).toContain('rare');
  });

  it('does not blame the user for canonical frustration or fatigue', () => {
    for (const mood of ['frustrated', 'exhausted', 'anxious']) {
      const emotion = resolveCharacterEmotionalReality({ mood, energy: 'low' });
      expect(emotion.source).toBe('scene');
      expect(emotion.target).toBe('unknown');
      expect(emotion.guidance).toContain('do not invent one or blame the user');
    }
  });

  it('lets authored and derived personalities respond differently to the same anger', () => {
    const emotion = resolveCharacterEmotionalReality({ mood: 'angry' });
    const knight = compileCharacterVoiceCard({ bible: { occupation: 'Knight' }, message: 'What happened?', mode: 'casual', emotionalReality: emotion });
    const lawyer = compileCharacterVoiceCard({ bible: { occupation: 'Lawyer' }, message: 'What happened?', mode: 'casual', emotionalReality: emotion });
    expect(knight.performance?.state).toBe('angry');
    expect(lawyer.performance?.state).toBe('angry');
    expect(knight.performance?.behavior).not.toBe(lawyer.performance?.behavior);
  });

  it('reserves sharp conflict for a direct insult, not ordinary profanity', () => {
    expect(directDisrespectSignal('Fuck you.')).toBe(true);
    expect(directDisrespectSignal('My shift was fucking awful.')).toBe(false);
    expect(directDisrespectSignal('You are such an idiot, lol')).toBe(false);
    const brief = compileResponseBrief({ message: 'Fuck you.', interactionQuality: 'normal', relationshipStance: stance });
    expect(brief.mode).toBe('conflicted');
    expect(brief.handoff.mode).toBe('none');
  });

  it('does not turn the user being angry at work into anger at the user', () => {
    expect(userDirectedConflictSignal('I am angry at work.')).toBe(false);
    expect(userDirectedConflictSignal('I am angry with you.')).toBe(true);
    const brief = compileResponseBrief({ message: 'I am angry at work.', interactionQuality: 'normal', relationshipStance: stance });
    expect(brief.mode).toBe('supportive');
    expect(brief.emotionalPosture).toContain('Do not diagnose the user');
  });

  it('preserves emotional direction if a director rewrites the brief', () => {
    const emotion = resolveCharacterEmotionalReality({ residue: { tone: 'angry', intensity: .65, target: 'user' } });
    const base = compileResponseBrief({ message: 'Hi.', interactionQuality: 'normal', relationshipStance: stance, characterEmotion: emotion });
    const changed = preserveCharacterEmotionalPosture({ ...base, mode: 'casual', emotionalPosture: 'Be pleasant.' }, emotion);
    expect(changed.emotionalPosture).toContain('Anger may make the reply sharper');
    expect(changed.mode).toBe('conflicted');
    expect(preserveCharacterEmotionalPosture(changed, emotion)).toEqual(changed);
  });
});

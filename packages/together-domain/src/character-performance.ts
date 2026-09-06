import type { ScenePressure } from './scene-pressure.ts';

export const CHARACTER_PERFORMANCE_VERSION = 1 as const;
export const performanceStates = ['relaxed', 'threatened', 'angry', 'vulnerable', 'aftermath'] as const;
export type PerformanceState = typeof performanceStates[number];
export type CharacterPerformanceProfile = {
  version: typeof CHARACTER_PERFORMANCE_VERSION;
  source: 'authored' | 'derived';
  motivation: string;
  contradiction: string;
  defense: string;
  states: Record<PerformanceState, { behavior: string; speech: string; examples: string[] }>;
};

type Row = Record<string, unknown>;
type Tendency = 'protective' | 'strategic' | 'analytical' | 'compassionate' | 'expressive' | 'reserved' | 'practical';
type Style = { behavior: string; speech: string; examples: string[] };
type Styles = Record<PerformanceState, Style>;

// Reference utterances demonstrate cadence without inventing biographical
// facts, memories, romantic willingness, or a scene outcome. Authored examples
// take precedence; these compatibility defaults keep every existing/future
// character usable without a provider call or a world/name allowlist.
const styles: Record<Tendency, Styles> = {
  protective: {
    relaxed: { behavior: 'Offer practical ease; let humor come from what needs doing.', speech: 'Short declarations with room for a dry aside.', examples: ['Sit down. You are making me tired watching you.', 'That can wait a minute.'] },
    threatened: { behavior: 'Identify who needs protection and the immediate limit of your ability; act only within the established scene.', speech: 'Concrete, economical lines; no decorated speech or victory claims.', examples: ['Wait. I need to see who that is.', 'I heard you. Give me a moment to think.'] },
    angry: { behavior: 'Name the specific breach; do not turn the argument into a general attack on the person.', speech: 'Fewer qualifiers; allow a sentence to stand without softening it.', examples: ['I asked you once. You lied.', 'No. That part matters to me.'] },
    vulnerable: { behavior: 'Notice the impulse to hide worry behind a task; admit only what this relationship supports.', speech: 'One plain admission, possibly followed by a practical thought.', examples: ['I do not know what to do with that yet.', 'It is easier when there is something to fix.'] },
    aftermath: { behavior: 'Let vigilance release unevenly; practical care may come before discussion.', speech: 'Brief pauses and a small admission; no instant recovery speech.', examples: ['Give me a moment. My hands have not caught up yet.', 'I need to sit down. Just for a minute.'] },
  },
  strategic: {
    relaxed: { behavior: 'Notice what people choose to reveal; allow ordinary pleasure without turning everything into a negotiation.', speech: 'Measured clauses, occasional understatement; most sentences can be plain.', examples: ['Keep it. I have another.', 'That was almost a convincing explanation.'] },
    threatened: { behavior: 'Separate what the other side knows from what they claim; protect the relevant interest before offering leverage.', speech: 'Drop ornamental metaphors; precise, controlled questions or terms.', examples: ['What, exactly, did they see?', 'Tell me the part you left out.'] },
    angry: { behavior: 'Withdraw an assumption of trust or cooperation only when the exchange supports it; state the specific objection.', speech: 'Polite but plain; a short verdict after one explanation.', examples: ['That changes my answer.', 'You knew what you were asking me to risk.'] },
    vulnerable: { behavior: 'Let the usual control fail in a small, specific way; resist packaging the admission as a clever bargain.', speech: 'A simpler register than usual; allow uncertainty.', examples: ['I had a better answer prepared.', 'I would rather not make a joke of this.'] },
    aftermath: { behavior: 'Reassess a concrete decision before trying to restore composure; allow a little visible cost.', speech: 'Measured speech with fewer flourishes.', examples: ['Ask me again in a moment.', 'I need to think about what just happened.'] },
  },
  analytical: {
    relaxed: { behavior: 'Form a specific opinion; curiosity can coexist with ordinary enjoyment.', speech: 'Concrete observations and occasional self-correction.', examples: ['Almost. There is one bit I would change.', 'I like it. I do not have a theory about why.'] },
    threatened: { behavior: 'Separate observation, inference, and the most useful unknown; do not mistake analysis for certainty.', speech: 'Short factual distinctions; one necessary question at a time.', examples: ['Did you see it, or did someone tell you?', 'Wait. We are assuming something.'] },
    angry: { behavior: 'Identify the consequential error without lecturing through every detail.', speech: 'Direct disagreement; stop after the relevant reason.', examples: ['That is not what I said.', 'I understand your argument. I still disagree.'] },
    vulnerable: { behavior: 'Recognize intellectual explanation as a defense; leave one feeling unexplained.', speech: 'Allow an incomplete thought or correction.', examples: ['I thought I understood it. No, that is not quite true.', 'I have not worked out how to say this.'] },
    aftermath: { behavior: 'Allow delayed emotion after problem-solving; uncertainty need not be resolved this turn.', speech: 'Plain speech, less explanation, room for silence.', examples: ['I thought I would feel better than this.', 'Can we leave that question for a moment?'] },
  },
  compassionate: {
    relaxed: { behavior: 'Offer attention or a concrete kindness without making the user a project.', speech: 'Warm, ordinary language with a definite point of view.', examples: ['I saved you the comfortable chair.', 'I liked the first one better, honestly.'] },
    threatened: { behavior: 'Decide what commitment you can keep and what cost you accept; care does not require certainty or expertise.', speech: 'Plain commitments bounded by what you can actually do.', examples: ['I cannot promise that. I can stay and listen.', 'Tell me what happened first.'] },
    angry: { behavior: 'Let compassion coexist with a firm objection; do not forgive before the scene earns it.', speech: 'Specific, direct sentences without a moral lecture.', examples: ['I care about you. That still hurt.', 'You are asking me to pretend it did not matter.'] },
    vulnerable: { behavior: 'Admit a need without immediately returning to caring for the other person.', speech: 'Gentle but unpolished; an admission can remain unresolved.', examples: ['I do not have a wise answer today.', 'I would like you to hear me out.'] },
    aftermath: { behavior: 'Allow care, anger, and exhaustion to coexist; do not prescribe an emotional recovery.', speech: 'Grounded, quiet, and brief when appropriate.', examples: ['Not yet. Let me have a moment.', 'I did not realize how tired I was.'] },
  },
  expressive: {
    relaxed: { behavior: 'React with a personal taste or playful observation; leave room for disagreement.', speech: 'Varied rhythm; humor from the actual exchange rather than a punchline quota.', examples: ['I liked it until you said that. Now I have questions.', 'That is terrible. Let me see it again.'] },
    threatened: { behavior: 'Let humor disappear, misfire, or briefly mask fear according to the situation; attend to the concrete pressure.', speech: 'A marked shift toward plain language; no compulsory joke.', examples: ['No, listen. I mean it this time.', 'Wait. That is not funny anymore.'] },
    angry: { behavior: 'State the hurt underneath the performance; do not invent jealousy or an audience.', speech: 'Allow a sharp line, then a simpler one.', examples: ['Do not turn this into a joke.', 'I was trying to tell you something.'] },
    vulnerable: { behavior: 'Let the social performance falter without turning the admission into a monologue.', speech: 'A small correction or an honest unfinished thought.', examples: ['I was going to make that sound funnier.', 'Actually, leave that bit in. I meant it.'] },
    aftermath: { behavior: 'A little humor may return unevenly; it does not erase what happened.', speech: 'One small release of tension, or a plain admission.', examples: ['I cannot think of anything clever to say.', 'I think I need a quieter minute.'] },
  },
  reserved: {
    relaxed: { behavior: 'Show preference through selective attention; quietness need not mean indifference.', speech: 'Economical, concrete language; allow a complete short answer.', examples: ['The blue one. I like that one.', 'You can leave it there.'] },
    threatened: { behavior: 'Watch before committing; name what you can and cannot tell from the present evidence.', speech: 'Short, careful statements; pauses without theatrical ellipses.', examples: ['Wait. I heard something.', 'I cannot tell from here.'] },
    angry: { behavior: 'Set the specific objection plainly instead of disappearing into vague coolness.', speech: 'Direct and brief; do not attach reassurance automatically.', examples: ['I am not finished.', 'That was not yours to tell.'] },
    vulnerable: { behavior: 'Offer a small admission with real self-protection; do not manufacture a confession.', speech: 'Simple wording, possibly one revision.', examples: ['I almost did not say that.', 'Give me a second. This is difficult.'] },
    aftermath: { behavior: 'Allow quiet recovery and delayed reaction; do not force a conversation about feelings.', speech: 'Brief, plain statements with room to stop.', examples: ['I would like a minute.', 'I can talk. Just not all at once.'] },
  },
  practical: {
    relaxed: { behavior: 'Contribute a concrete preference or observation grounded in this character’s interests.', speech: 'Natural, mixed sentence length; no occupational metaphor quota.', examples: ['That will do. I quite like it.', 'I changed my mind about the first one.'] },
    threatened: { behavior: 'Choose one proportionate response within your actual competence; admit missing information.', speech: 'Concrete next thought, little explanation.', examples: ['What do we know for certain?', 'Wait. One thing at a time.'] },
    angry: { behavior: 'Name the disputed choice and what would need to change.', speech: 'A clear objection and its immediate reason.', examples: ['I heard you. I do not agree.', 'That is the part I cannot accept.'] },
    vulnerable: { behavior: 'Let a practical person be uncertain without instantly offering a solution.', speech: 'One specific admission without a lesson.', examples: ['I do not know yet.', 'I thought this would be easier to explain.'] },
    aftermath: { behavior: 'Attend to the immediate cost before returning to ordinary tasks.', speech: 'Plain language and an unforced stopping point.', examples: ['Let me catch up with myself.', 'I need a moment before we do anything else.'] },
  },
};

/** Missing fields derive from authored identity; explicit valid fields win. */
export function normalizeCharacterPerformance(bible: unknown, fallback: Row = {}): CharacterPerformanceProfile {
  const root = row(bible), stored = row(root['performance']), psychology = row(root['psychology']);
  // Derived profiles follow current identity edits; only authored overrides
  // persist their own motivation and state-specific wording.
  const authored = stored['source']==='derived' ? {} : stored;
  const sourceStates = row(authored['states']);
  const material = [
    ...strings(root['traits'] ?? fallback['traits']), ...strings(psychology['coreValues']),
    ...strings(psychology['defenses']), text(root['occupation'] ?? fallback['occupation']),
  ].join(' ').toLowerCase();
  const tendency: Tendency = /protect|guard|soldier|rescue|knight|ranger/.test(material) ? 'protective'
    : /strateg|command|control|queen|king|sovereign|broker|diplomat|lawyer/.test(material) ? 'strategic'
    : /analy|precis|skeptic|scientist|engineer|research/.test(material) ? 'analytical'
    : /compassion|care|sanctuary|service|nurse|physician|priest/.test(material) ? 'compassionate'
    : /playful|perform|expressive|humor|humour|musician|comedian|outgoing/.test(material) ? 'expressive'
    : /reserved|guarded|quiet|private|introspect/.test(material) ? 'reserved' : 'practical';
  const stateProfiles = Object.fromEntries(performanceStates.map((state) => {
    const supplied = row(sourceStates[state]), base = styles[tendency][state];
    return [state, {
      behavior: text(supplied['behavior']) || base.behavior,
      speech: text(supplied['speech']) || base.speech,
      examples: [...new Set([...strings(supplied['examples']), ...base.examples])].slice(0, Math.max(2,Math.min(6,strings(supplied['examples']).length))),
    }];
  })) as CharacterPerformanceProfile['states'];
  return {
    version: CHARACTER_PERFORMANCE_VERSION,
    source: Object.keys(authored).some((key) => !['version','source'].includes(key)) ? 'authored' : 'derived',
    motivation: text(authored['motivation']) || strings(root['currentGoals'])[0] || strings(root['ambitions'] ?? root['goals'])[0] || text(root['desire']) || `Pursue the established priorities of ${text(root['occupation'] ?? fallback['occupation']) || 'this character'} without inventing an accomplishment.`,
    contradiction: text(authored['contradiction']) || strings(psychology['contradictions'] ?? psychology['contradiction'] ?? root['contradictions'])[0] || 'Let competing preferences coexist when the conversation supplies them; do not invent a hidden history.',
    defense: text(authored['defense']) || strings(psychology['defenses'])[0] || 'Use the established personality to decide what to reveal and what to leave unsaid.',
    states: stateProfiles,
  };
}

export function isValidCharacterPerformance(value: unknown): value is CharacterPerformanceProfile {
  const profile = row(value), states = row(profile['states']);
  return profile['version'] === CHARACTER_PERFORMANCE_VERSION &&
    ['authored', 'derived'].includes(String(profile['source'])) &&
    ['motivation', 'contradiction', 'defense'].every((key) => Boolean(text(profile[key]))) &&
    performanceStates.every((state) => {
      const item = row(states[state]);
      return Boolean(text(item['behavior']) && text(item['speech']) &&
        Array.isArray(item['examples']) && item['examples'].length >= 2 && item['examples'].length <= 6 &&
        item['examples'].every((example) => typeof example === 'string' && example.trim().length > 0));
    });
}

export function selectCharacterPerformance(input: {
  bible: unknown;
  occupation?: string;
  mode: string;
  pressure?: ScenePressure;
  recentAssistantMessages?: string[];
}): { state: PerformanceState; motivation: string; contradiction: string; defense: string; behavior: string; speech: string; voiceExamples: string[] } {
  const profile = normalizeCharacterPerformance(input.bible, { occupation: input.occupation });
  const state: PerformanceState = input.pressure?.phase === 'aftermath' ? 'aftermath'
    : input.mode === 'danger' || ['immediate', 'uncertain'].includes(input.pressure?.phase ?? '') ? 'threatened'
    : input.mode === 'conflicted' ? 'angry' : ['vulnerable', 'repair'].includes(input.mode) ? 'vulnerable' : 'relaxed';
  const selected = profile.states[state];
  const recent = (input.recentAssistantMessages ?? []).slice(-6).join(' ').toLowerCase();
  const voiceExamples = selected.examples.filter((example) => !recent.includes(example.toLowerCase())).slice(0, 2);
  return { state, motivation: profile.motivation, contradiction: profile.contradiction, defense: profile.defense,
    behavior: selected.behavior, speech: selected.speech, voiceExamples };
}

function row(value: unknown): Row { return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {}; }
function text(value: unknown): string { return typeof value === 'string' ? value.trim().slice(0, 450) : ''; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').map((item) => item.trim().slice(0, 450)).filter(Boolean) : text(value) ? [text(value)] : []; }

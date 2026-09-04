export type SceneActionDecision = 'accepted' | 'countered' | 'declined' | string;

type SceneActionReactionInput = {
  decision: SceneActionDecision;
  label: string;
  requestedLabel: string;
  family?: string | null;
};

function activeBeatDirection(family?: string | null) {
  if (family === 'talk' || family === 'social' || family === 'share') {
    return 'Actually open the subject now with a concrete observation, opinion, or natural question that gives the user something to respond to.';
  }
  return 'Enter the activity in the present moment with a concrete, character-specific line or action beat that moves it forward.';
}

export function buildSceneActionReactionInstruction(input: SceneActionReactionInput) {
  if (input.decision === 'accepted') {
    return `The selected shared beat is beginning now: ${input.label}. ${activeBeatDirection(input.family)} Speak from inside the moment as it starts or unfolds. Do not recap it as something you and the user already discussed, chose, finished, or did.`;
  }
  if (input.decision === 'countered') {
    return `You passed on ${input.requestedLabel} and the shared beat beginning now is your counter-suggestion: ${input.label}. ${activeBeatDirection(input.family)} Do not recap the counter-suggestion as already completed.`;
  }
  return `Respond directly and naturally to declining this suggestion: ${input.requestedLabel}. Keep the conversation moving without pretending the declined activity occurred.`;
}

export function sceneActionReactionFallback(input: SceneActionReactionInput) {
  if (input.decision === 'accepted') return `Let’s ${input.label.toLowerCase()}. What’s catching your attention most right now?`;
  if (input.decision === 'countered') return `I’d rather ${input.label.toLowerCase()}—let’s start there.`;
  return `I’d rather pass on ${input.requestedLabel.toLowerCase()}, but I’m still here with you.`;
}

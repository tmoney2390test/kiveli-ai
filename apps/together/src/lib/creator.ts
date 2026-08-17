export function creatorSampleMessages(input: {
  name: string;
  warmth: number;
  humor: number;
  directness: number;
  messageLength?: string;
}): string[] {
  const opening = input.directness >= 0.65
    ? 'Tell me what you actually think.'
    : "You can take your time. I'm listening.";
  const playful = input.humor >= 0.65
    ? "That is a confident answer. I'm deciding whether it was also a good one."
    : "I noticed that. I just wasn't going to interrupt you.";
  const warm = input.warmth >= 0.65
    ? "You don't have to make it sound smaller for me."
    : 'I understand. I may need a little time before I know what I think.';
  const samples = input.messageLength === 'concise' ? [opening, playful] : [opening, playful, warm];
  return samples.map((message) => `${input.name}: ${message}`);
}

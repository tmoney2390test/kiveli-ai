export type ConversationStyle = 'texting' | 'paragraph';
export type ConversationResponseLength = 'micro' | 'short' | 'medium' | 'long';
export type ConversationInteractionQuality = 'trivial' | 'normal' | 'meaningful' | 'shared_experience' | 'major_relationship_event';

export function resolveConversationStyle(value: unknown): ConversationStyle {
  const preference = value && typeof value === 'object'
    ? (value as Record<string, unknown>)['responseStyle'] ?? (value as Record<string, unknown>)['response_style']
    : value;
  const candidate = typeof preference === 'string' ? preference : '';
  return candidate === 'paragraph' ? 'paragraph' : 'texting';
}

export function conversationResponseLength(input: {
  style?: unknown;
  intent?: string;
  interactionQuality?: ConversationInteractionQuality;
  message: string;
}): ConversationResponseLength {
  const style = resolveConversationStyle(input.style);
  const intent = String(input.intent ?? 'casual');
  const quality = input.interactionQuality ?? 'normal';
  const message = input.message.trim();
  const tinyReaction = /^(lol|lmao|ok|okay|yeah|yep|nope|nice|cool|sure|wow)[.!?]*$/i.test(message);
  if (tinyReaction || quality === 'trivial') return 'micro';

  const storytelling = intent === 'storytelling' || /\b(tell me (?:a story|about)|what happened|walk me through)\b/i.test(message);
  const emotionallyComplex = ['vulnerable', 'supportive', 'conflicted', 'repair'].includes(intent)
    || /\b(break up|relationship is not working|don't think (?:this |our )?relationship is working|quit my job|apolog|betray|grief|died|trauma)\b/i.test(message);
  const complicatedPlanning = intent === 'practical' && /\b(conflict|reschedule|cancel|overlap|available|complicated|instead)\b/i.test(message);

  if (style === 'texting') {
    if (quality === 'major_relationship_event') return 'medium';
    if (storytelling || emotionallyComplex || quality === 'shared_experience' || message.length > 500 || complicatedPlanning) return 'medium';
    if (quality === 'meaningful' && (emotionallyComplex || message.length > 220)) return 'medium';
    return 'short';
  }

  if (quality === 'major_relationship_event' || storytelling) return 'long';
  if (quality === 'meaningful' || quality === 'shared_experience' || emotionallyComplex || complicatedPlanning || message.length > 180) return 'medium';
  return 'short';
}

export function conversationResponseTokenBudget(input: {
  style?: unknown;
  length: ConversationResponseLength;
}): number {
  const style = resolveConversationStyle(input.style);
  const budgets: Record<ConversationStyle, Record<ConversationResponseLength, number>> = {
    texting: { micro: 80, short: 160, medium: 300, long: 380 },
    paragraph: { micro: 100, short: 220, medium: 380, long: 520 },
  };
  return budgets[style][input.length];
}

export function conversationStyleGuidance(value: unknown): string {
  return resolveConversationStyle(value) === 'paragraph'
    ? 'Respond in complete conversational thoughts with room for personality, reaction, emotional nuance, and useful context. Prefer one or two compact paragraphs when useful. Do not become essay-like, overly explanatory, repetitive, or artificially verbose. Short replies are still appropriate when the moment naturally calls for them.'
    : 'Write like this character is texting the user. Prefer brief, natural messages; one or two short sentences are often enough. Be specific and characterful rather than explanatory. Avoid unnecessary summaries, disclaimers, multi-paragraph analysis, and repeated context. Do not force slang, abbreviations, lowercase text, emojis, or fragments unless they fit this character. Longer responses are allowed when emotional significance, story, conflict, or complexity genuinely requires them.';
}

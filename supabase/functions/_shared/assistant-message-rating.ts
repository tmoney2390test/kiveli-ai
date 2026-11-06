import {
  classifyDialogueContent,
  hasExplicitSexualOutputLanguage,
  hasSexualDialogueLanguage,
  type DialogueRoutingDecision,
  type NormalizedModerationResult,
} from '../../../packages/together-domain/src/index.ts';

/** A model route describes context, not necessarily the text it produced. */
export function assistantMessageRating(
  route: DialogueRoutingDecision,
  text: string,
  outputSafety?: NormalizedModerationResult,
): 'safe' | 'suggestive' | 'explicit' {
  if (!route.explicit) return route.resolvedMode === 'standard' ? 'safe' : 'suggestive';
  // Only adult-context carryover can be downgraded. Missing moderation data,
  // sexual signals, and uncertain classifications all remain private.
  if (route.reason !== 'adult_context_carryover' || !outputSafety?.allowed ||
    outputSafety.categories.some((category) => category.startsWith('sexual')) ||
    hasSexualDialogueLanguage(text) || hasExplicitSexualOutputLanguage(text)) return 'explicit';
  const content = classifyDialogueContent({ message: text, requestedMode: 'mature', moderation: outputSafety });
  if (content === 'standard') return 'safe';
  if (content === 'romantic') return 'suggestive';
  return 'explicit';
}

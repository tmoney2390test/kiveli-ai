import {
  CHAT_DYNAMISM_VALUES,
  REASONING_PREFERENCES,
  chatDynamismLabel,
  normalizeDialogueSubscriptionTier,
  reasoningPreferenceAllowedForTier,
  reasoningPreferenceLabel,
  type ChatDynamism,
  type ReasoningPreference,
} from '@together/domain/src/chat-generation';

export type ChatGenerationChoice<T extends string | number>={
  value:T;
  label:string;
  description:string;
  badge?:string;
  locked?:boolean;
};

export function chatGenerationChoiceInteraction<T extends string|number>(choice:ChatGenerationChoice<T>,selected:T):{
  active:boolean;
  upgrade:boolean;
  action:'close'|'upgrade'|'select';
  accessibilityRole:'button'|'radio';
  showCheck:boolean;
  showLock:boolean;
}{
  const active=choice.value===selected;
  const upgrade=choice.locked===true&&!active;
  return{
    active,
    upgrade,
    action:active?'close':upgrade?'upgrade':'select',
    accessibilityRole:upgrade?'button':'radio',
    showCheck:active,
    showLock:upgrade,
  };
}

const dynamismDescriptions:Record<ChatDynamism,string>={
  0:'Consistent, direct, and predictable.',
  25:'Natural variation with strong conversational consistency.',
  50:'Balanced personality, creativity, and consistency.',
  75:'More colorful, spontaneous, and emotionally varied.',
  100:'Bold and surprising while staying consistent.',
};

const reasoningDescriptions:Record<ReasoningPreference,string>={
  auto:'Kivelli chooses the right depth for each message.',
  none:'Fastest responses for simple conversation.',
  low:'A little more thought while staying responsive.',
  medium:'Deeper reasoning for emotional and complex moments.',
  high:'Maximum available reasoning for important scenes.',
};

export const chatDynamismChoices:ChatGenerationChoice<ChatDynamism>[]=CHAT_DYNAMISM_VALUES.map((value)=>({
  value,
  label:chatDynamismLabel(value),
  description:dynamismDescriptions[value],
  ...(value===50?{badge:'Recommended'}:{}),
}));

export function reasoningChoicesForTier(tier:unknown):ChatGenerationChoice<ReasoningPreference>[] {
  const normalizedTier=normalizeDialogueSubscriptionTier(tier);
  return REASONING_PREFERENCES.map((value)=>({
    value,
    label:reasoningPreferenceLabel(value),
    description:reasoningDescriptions[value],
    ...(value==='auto'?{badge:'Recommended'}:{}),
    ...(value==='medium'?{badge:'Kivelle+'}:value==='high'?{badge:'Max'}:{}),
    locked:!reasoningPreferenceAllowedForTier(value,normalizedTier),
  }));
}

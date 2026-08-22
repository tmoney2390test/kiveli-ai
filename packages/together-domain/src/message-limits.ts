export const MESSAGE_CHARACTER_LIMIT = 2_000;
export const MESSAGE_CHARACTER_COUNTER_THRESHOLD = 1_600;
export const MESSAGE_CHARACTER_WARNING_THRESHOLD = 1_800;

export type MessageCharacterTone = 'normal' | 'warning' | 'danger';

export function messageCharacterState(message: string) {
  const length = message.length;
  return {
    length,
    limit: MESSAGE_CHARACTER_LIMIT,
    remaining: MESSAGE_CHARACTER_LIMIT - length,
    showCounter: length >= MESSAGE_CHARACTER_COUNTER_THRESHOLD,
    overLimit: length > MESSAGE_CHARACTER_LIMIT,
    tone: length >= MESSAGE_CHARACTER_LIMIT
      ? 'danger'
      : length >= MESSAGE_CHARACTER_WARNING_THRESHOLD
        ? 'warning'
        : 'normal',
  };
}

export function messageCharacterLimitError() {
  return `Messages can be up to ${MESSAGE_CHARACTER_LIMIT.toLocaleString('en-US')} characters.`;
}

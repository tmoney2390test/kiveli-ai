export const chatBubbleColorValues = [
  'default',
  'rose',
  'berry',
  'plum',
  'violet',
  'blue',
  'teal',
  'forest',
  'ember',
] as const;

export type ChatBubbleColor = typeof chatBubbleColorValues[number];

export type ChatBubbleColorOption = {
  value: ChatBubbleColor;
  label: string;
  color: string | null;
};

export const chatBubbleColorOptions: readonly ChatBubbleColorOption[] = [
  { value: 'default', label: 'Default', color: null },
  { value: 'rose', label: 'Rose', color: '#9D2F63' },
  { value: 'berry', label: 'Berry', color: '#71344F' },
  { value: 'plum', label: 'Plum', color: '#5C376B' },
  { value: 'violet', label: 'Violet', color: '#493F86' },
  { value: 'blue', label: 'Blue', color: '#315B78' },
  { value: 'teal', label: 'Teal', color: '#2E6663' },
  { value: 'forest', label: 'Forest', color: '#3A604A' },
  { value: 'ember', label: 'Ember', color: '#8F4935' },
] as const;

const chatBubbleColorSet = new Set<string>(chatBubbleColorValues);

export function isChatBubbleColor(value: unknown): value is ChatBubbleColor {
  return typeof value === 'string' && chatBubbleColorSet.has(value);
}

export function normalizeChatBubbleColor(value: unknown): ChatBubbleColor {
  return isChatBubbleColor(value) ? value : 'default';
}

export function chatBubbleColorHex(value: unknown): string | null {
  const normalized = normalizeChatBubbleColor(value);
  return chatBubbleColorOptions.find((option) => option.value === normalized)?.color ?? null;
}

export function chatBubbleTextColor(value: unknown): '#FFF8F4' | '#17131E' {
  const color = chatBubbleColorHex(value);
  if (!color) return '#FFF8F4';
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance > 0.62 ? '#17131E' : '#FFF8F4';
}

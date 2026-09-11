import type { ReactElement, ReactNode } from 'react';
import { expect, it, vi } from 'vitest';
import { ContextCostConfirmation } from './ContextCostConfirmation';
import type { useContextQuote } from '../../hooks/useContextQuote';
vi.mock('react-native', () => ({ Modal: 'Modal', Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View', StyleSheet: { create: (styles: unknown) => styles, absoluteFill: {} } }));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 34 }) }));
vi.mock('lucide-react-native', () => ({ X: 'X' }));
vi.mock('../FrostedGlass', () => ({ FrostedBackdrop: 'Backdrop', FrostedSurface: 'Surface' }));
type Node = ReactElement<{ children?: ReactNode; onPress?: () => void; onRequestClose?: () => void; accessibilityLabel?: string }>;
function flatten(node: ReactNode): Node[] {
  if (Array.isArray(node)) return node.flatMap(flatten);
  if (!node || typeof node !== 'object' || !('props' in node)) return [];
  return [node as Node, ...flatten((node as Node).props.children)];
}
const pricing = (kind: 'confirm' | 'photo' | 'error' | null) => ({ selected: 'extended_32k', prompt: kind ? { kind } : null, respond: vi.fn(), blocked: true, authorize: vi.fn() }) as ReturnType<typeof useContextQuote>;
it('renders nothing until Send needs a decision', () => { expect(ContextCostConfirmation({ pricing: pricing(null) })).toBeNull(); });
it('explains ongoing additional credits and wires Proceed, cancel, backdrop and system close', () => {
  const state = pricing('confirm'), result = ContextCostConfirmation({ pricing: state })!;
  const nodes = flatten(result), text = JSON.stringify(result);
  expect(text).toContain('Memory setting applied'); expect(text).toContain('additional Kivelli credits'); expect(text).toContain('Proceed?');
  expect(text).not.toContain('Calculating message price');
  const buttons = nodes.filter(node => node.props.onPress);
  buttons.find(node => JSON.stringify(node.props.children ?? null).includes('Proceed'))!.props.onPress!();
  expect(state.respond).toHaveBeenLastCalledWith('proceed');
  buttons.find(node => node.props.accessibilityLabel === 'Cancel memory confirmation')!.props.onPress!();
  expect(state.respond).toHaveBeenLastCalledWith('cancel');
  result.props.onRequestClose(); expect(state.respond).toHaveBeenLastCalledWith('cancel');
});

import type { CompanionSortMode } from './companionSort';
export type DiscoverSession = { tab: 'People' | 'Experiences'; spice: 'any' | 1 | 2 | 3; sortMode: CompanionSortMode; visibleCount: number; scrollY: number };
const sessions = new Map<string, DiscoverSession>();
export function readDiscoverSession(scope: string): DiscoverSession {
  return { ...(sessions.get(scope) ?? { tab: 'People', spice: 'any', sortMode: 'recommended', visibleCount: 12, scrollY: 0 }) };
}
export function saveDiscoverSession(scope: string, state: DiscoverSession) {
  sessions.set(scope, { ...state, scrollY: Math.max(0, state.scrollY), visibleCount: Math.max(12, state.visibleCount) });
  if (sessions.size > 20) sessions.delete(sessions.keys().next().value!);
}

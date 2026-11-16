export type ChatComposerOwner = 'direct' | 'group';

export function isChatComposerRouteActive(
  owner: ChatComposerOwner,
  pathname: string,
  group?: string | null,
  focused = true,
): boolean {
  if (!focused) return false;
  const path = pathname.replace(/\/$/, '') || '/';
  if (owner === 'group') return path === '/group-chat' || (path === '/chat' && group === '1');
  return path === '/chat' && group !== '1';
}

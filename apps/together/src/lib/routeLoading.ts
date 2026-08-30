export type RouteLoadingKind = 'home' | 'explore' | 'moments' | 'messages' | 'stories' | 'default';

export function routeLoadingKind(pathname: string): RouteLoadingKind {
  if (pathname === '/' || pathname.startsWith('/home')) return 'home';
  if (pathname.startsWith('/explore')) return 'explore';
  if (pathname.startsWith('/moments') || pathname.startsWith('/media/')) return 'moments';
  if (pathname.startsWith('/chat') || pathname.startsWith('/group-chat')) return 'messages';
  if (pathname.startsWith('/stories')) return 'stories';
  return 'default';
}

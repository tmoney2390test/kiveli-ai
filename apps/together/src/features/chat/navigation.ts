import { Platform } from 'react-native';
import { router } from 'expo-router';
import { navigateLocalRouteOnWeb } from '../../lib/conversationNavigation';
export function navigateChatSurface(href: string, mode: 'push' | 'replace' = 'push') {
  if (Platform.OS === 'web' && navigateLocalRouteOnWeb(href, mode)) {
    return;
  }
  if (mode === 'replace') {
    router.replace(href as never);
  } else {
    router.push(href as never);
  }
}

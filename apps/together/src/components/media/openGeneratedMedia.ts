import { Platform } from 'react-native';
import { router } from 'expo-router';
import { mediaViewerHref, navigateLocalRouteOnWeb } from '../../lib/conversationNavigation';

export function openGeneratedMedia(mediaId: string) {
  const returnTo = Platform.OS === "web" && typeof window !== "undefined"
    ? `${window.location.pathname}${window.location.search}`
    : null;
  const href = mediaViewerHref(mediaId, returnTo);
  if (Platform.OS === "web" && navigateLocalRouteOnWeb(href)) return;
  router.push(href as never);
}

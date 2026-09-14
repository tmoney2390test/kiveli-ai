import { useCallback } from 'react';
import { Platform } from 'react-native';
import { useNavigation } from 'expo-router';
import { navigateLocalRouteOnWeb } from '../lib/appNavigation';
import { messagesInboxNavigationState, WEB_MESSAGES_INBOX_HREF } from '../lib/messageInbox';

export function useChatInboxNavigation() {
  const navigation = useNavigation('/');
  return useCallback(() => {
    if (Platform.OS === 'web') {
      navigateLocalRouteOnWeb(WEB_MESSAGES_INBOX_HREF, 'replace');
      return;
    }
    navigation.dispatch({ type: 'RESET', payload: messagesInboxNavigationState() });
  }, [navigation]);
}


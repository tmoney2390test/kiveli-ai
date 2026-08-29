import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { configureForegroundNotifications, openPushResponse, registerPushNotifications } from '../lib/pushNotifications';
import { useAuth } from '../hooks/useAuth';
import { useTogether } from '../store/useTogether';

configureForegroundNotifications();

export function PushNotificationBridge() {
  const { session } = useAuth();
  const enabled = useTogether((state) => state.snapshot?.notificationPreferences?.push_enabled);

  useEffect(() => {
    if (session && enabled) void registerPushNotifications(false).catch(() => undefined);
  }, [enabled, session?.user.id]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(openPushResponse);
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) openPushResponse(response);
    }).catch(() => undefined);
    return () => subscription.remove();
  }, []);

  return null;
}

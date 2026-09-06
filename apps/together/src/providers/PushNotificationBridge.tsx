import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { usePathname } from 'expo-router';
import { configureForegroundNotifications, openPushResponse, registerPushNotifications } from '../lib/pushNotifications';
import { useAuth } from '../hooks/useAuth';
import { useTogether } from '../store/useTogether';

export function PushNotificationBridge() {
  const { session } = useAuth();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const sessionRef = useRef(session);
  const pendingResponse = useRef<Notifications.NotificationResponse | null>(null);
  pathnameRef.current = pathname;
  sessionRef.current = session;
  const enabled = useTogether((state) => state.snapshot?.notificationPreferences?.push_enabled);

  useEffect(() => {
    configureForegroundNotifications(() => pathnameRef.current);
  }, []);

  useEffect(() => {
    if (session && enabled) void registerPushNotifications(false).catch(() => undefined);
  }, [enabled, session?.user.id]);

  useEffect(() => {
    const handle=(response:Notifications.NotificationResponse)=>{
      if(!sessionRef.current){pendingResponse.current=response;return;}
      openPushResponse(response);
    };
    const subscription = Notifications.addNotificationResponseReceivedListener(handle);
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handle(response);
    }).catch(() => undefined);
    return () => subscription.remove();
  }, []);

  useEffect(()=>{
    if(!session||!pendingResponse.current)return;
    const response=pendingResponse.current;pendingResponse.current=null;openPushResponse(response);
  },[session?.user.id]);

  return null;
}

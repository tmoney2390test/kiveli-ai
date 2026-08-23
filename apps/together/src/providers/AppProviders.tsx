import { type PropsWithChildren, useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  initialWindowMetrics,
  SafeAreaProvider,
} from "react-native-safe-area-context";
import { Platform } from "react-native";
import { AuthProvider } from "../hooks/useAuth";
import { KivelleSessionGate } from "./KivelleSessionGate";
import * as Notifications from "expo-notifications";
import {
  configureForegroundNotifications,
  openPushResponse,
  registerPushNotifications,
} from "../lib/pushNotifications";
import { useAuth } from "../hooks/useAuth";
import { useTogether } from "../store/useTogether";
import {
  AppErrorBoundary,
  GlobalErrorReporter,
} from "../components/AppErrorBoundary";
import { NetworkStatusProvider } from "./NetworkStatusProvider";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { reportClientHeartbeat } from "../lib/operations";

configureForegroundNotifications();

function PushNotificationBridge() {
  const { session } = useAuth(),
    enabled = useTogether((state) =>
      state.snapshot?.notificationPreferences?.push_enabled
    );
  useEffect(() => {
    if (session && enabled) {
      void registerPushNotifications(false).catch(() => undefined);
    }
  }, [enabled, session?.user.id]);
  useEffect(() => {
    if (Platform.OS === "web") return;
    const subscription = Notifications.addNotificationResponseReceivedListener(
      openPushResponse,
    );
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) openPushResponse(response);
    }).catch(() => undefined);
    return () => subscription.remove();
  }, []);
  return null;
}

function OperationsHeartbeat() {
  const { session } = useAuth();
  useEffect(() => {
    if (!session?.user.id) return;
    let cancelled = false;
    const key = `kivelle:client-heartbeat:${session.user.id}`;
    void AsyncStorage.getItem(key).then(async (value) => {
      if (cancelled || value && Date.now() - Number(value) < 12 * 60 * 60_000) {
        return;
      }
      await reportClientHeartbeat();
      if (!cancelled) await AsyncStorage.setItem(key, String(Date.now()));
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [session?.user.id]);
  return null;
}

export function AppProviders({ children }: PropsWithChildren) {
  const [client] = useState(() =>
    new QueryClient({
      defaultOptions: {
        queries: { staleTime: 15000, retry: 1 },
        mutations: { retry: 0 },
      },
    })
  );
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <NetworkStatusProvider>
          <QueryClientProvider client={client}>
            <AuthProvider>
              <PushNotificationBridge />
              <OperationsHeartbeat />
              <GlobalErrorReporter />
              <AppErrorBoundary>
                <KivelleSessionGate>{children}</KivelleSessionGate>
              </AppErrorBoundary>
            </AuthProvider>
          </QueryClientProvider>
        </NetworkStatusProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

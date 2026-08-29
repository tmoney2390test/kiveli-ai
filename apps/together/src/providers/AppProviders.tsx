import { type PropsWithChildren, useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  initialWindowMetrics,
  SafeAreaProvider,
} from "react-native-safe-area-context";
import { AuthProvider } from "../hooks/useAuth";
import { KivelleSessionGate } from "./KivelleSessionGate";
import { useAuth } from "../hooks/useAuth";
import {
  AppErrorBoundary,
  GlobalErrorReporter,
} from "../components/AppErrorBoundary";
import { NetworkStatusProvider } from "./NetworkStatusProvider";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { reportClientHeartbeat } from "../lib/operations";
import { PushNotificationBridge } from "./PushNotificationBridge";

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

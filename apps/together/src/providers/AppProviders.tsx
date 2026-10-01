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
import { colors } from "../theme";
import { ClientPerformanceBridge } from "../components/ClientPerformanceBridge";
import { RevenueCatSessionBridge } from "./RevenueCatSessionBridge";
import { WebAdultSessionBridge } from "./WebAdultSessionBridge";
import { useTogether } from "../store/useTogether";
import { PendingMediaRecovery } from "./PendingMediaRecovery";
import { AiConsentBridge } from "./AiConsentBridge";
import { WebDocumentAccessibilityBridge } from "./WebDocumentAccessibilityBridge";
import { AccountMenuHost } from "../components/AccountMenuHost";

function OperationsHeartbeat() {
  const { session } = useAuth();
  const snapshotReady = useTogether((state) => Boolean(state.snapshot));
  useEffect(() => {
    if (!session?.user.id || !snapshotReady) return;
    let cancelled = false;
    const key = `kivelle:client-heartbeat:${session.user.id}`;
    const timer = setTimeout(() => { void AsyncStorage.getItem(key).then(async (value) => {
      if (cancelled || value && Date.now() - Number(value) < 12 * 60 * 60_000) {
        return;
      }
      await reportClientHeartbeat();
      if (!cancelled) await AsyncStorage.setItem(key, String(Date.now()));
    }).catch(() => undefined); }, 15_000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [session?.user.id, snapshotReady]);
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
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <NetworkStatusProvider>
          <QueryClientProvider client={client}>
            <AuthProvider>
              <AiConsentBridge />
              <PushNotificationBridge />
              <RevenueCatSessionBridge />
              <WebAdultSessionBridge />
              <PendingMediaRecovery />
              <WebDocumentAccessibilityBridge />
              <OperationsHeartbeat />
              <ClientPerformanceBridge />
              <GlobalErrorReporter />
              <AppErrorBoundary>
                <AccountMenuHost>
                  <KivelleSessionGate>
                    <AppErrorBoundary>{children}</AppErrorBoundary>
                  </KivelleSessionGate>
                </AccountMenuHost>
              </AppErrorBoundary>
            </AuthProvider>
          </QueryClientProvider>
        </NetworkStatusProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

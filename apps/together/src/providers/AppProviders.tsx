import { type PropsWithChildren, useEffect, useState } from "react";
import { AppState, Platform, StyleSheet, Text, View } from 'react-native';
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
import { WebDocumentAccessibilityBridge } from "./WebDocumentAccessibilityBridge";

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

function PrivateAppSwitcherCover(){
  const[covered,setCovered]=useState(Platform.OS!=='web'&&AppState.currentState!=='active');
  useEffect(()=>{if(Platform.OS==='web')return;const subscription=AppState.addEventListener('change',(state)=>setCovered(state!=='active'));return()=>subscription.remove();},[]);
  if(!covered)return null;
  return <View accessibilityLabel="Kivelle is hidden while in the background" style={styles.privacyCover}><View style={styles.privacyMark}/><Text style={styles.privacyTitle}>Kivelle</Text><Text style={styles.privacyCopy}>Your private conversations are hidden.</Text></View>;
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
              <PushNotificationBridge />
              <RevenueCatSessionBridge />
              <WebAdultSessionBridge />
              <PendingMediaRecovery />
              <WebDocumentAccessibilityBridge />
              <OperationsHeartbeat />
              <ClientPerformanceBridge />
              <GlobalErrorReporter />
              <AppErrorBoundary>
                <KivelleSessionGate>
                  <AppErrorBoundary>{children}</AppErrorBoundary>
                </KivelleSessionGate>
                <PrivateAppSwitcherCover />
              </AppErrorBoundary>
            </AuthProvider>
          </QueryClientProvider>
        </NetworkStatusProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles=StyleSheet.create({privacyCover:{...StyleSheet.absoluteFill,zIndex:9999,elevation:9999,alignItems:'center',justifyContent:'center',backgroundColor:colors.background,gap:10},privacyMark:{width:42,height:42,borderRadius:21,backgroundColor:colors.violet,borderWidth:1,borderColor:colors.rose},privacyTitle:{color:colors.text,fontSize:24,fontWeight:'900'},privacyCopy:{color:colors.muted,fontSize:12}});

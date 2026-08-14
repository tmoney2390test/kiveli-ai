import { useState, type PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { AuthProvider } from '../hooks/useAuth';

export function AppProviders({children}:PropsWithChildren){const[client]=useState(()=>new QueryClient({defaultOptions:{queries:{staleTime:15000,retry:1},mutations:{retry:0}}}));return <GestureHandlerRootView style={{flex:1}}><SafeAreaProvider initialMetrics={initialWindowMetrics}><QueryClientProvider client={client}><AuthProvider>{children}</AuthProvider></QueryClientProvider></SafeAreaProvider></GestureHandlerRootView>;}

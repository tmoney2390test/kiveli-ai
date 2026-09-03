import { DarkTheme, router, Stack, ThemeProvider } from 'expo-router';
import Head from 'expo-router/head';
import { StatusBar } from 'expo-status-bar';
import { AppProviders } from '../src/providers/AppProviders';
import { colors } from '../src/theme';
import { createKivelliNavigationTheme } from '../src/lib/navigationTheme';
import { RouteTransitionVeil } from '../src/components/RouteTransitionVeil';
import { installWebNavigationCompatibility } from '../src/lib/appNavigation';

const navigationTheme=createKivelliNavigationTheme(DarkTheme);
installWebNavigationCompatibility(router);

export default function RootLayout(){return <ThemeProvider value={navigationTheme}><Head><title>Kivelle.AI</title></Head><AppProviders><StatusBar style="light"/><Stack screenOptions={{headerShown:false,contentStyle:{backgroundColor:colors.background},animation:'fade'}}/><RouteTransitionVeil/></AppProviders></ThemeProvider>;}
